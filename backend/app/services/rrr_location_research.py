"""
One-time location research → persistent RAG (Agent: Browserbase + Gemini).

Run once during onboarding for a user's zip/address. Browserbase searches the
locale's curbside trash/recycling rules, bulky-pickup program (and its
eligibility constraints), HHW/e-waste drop-off, and donation orgs; Gemini
synthesizes them into structured RAG documents that are persisted in Redis with
NO TTL (key: location_rag:{zip}) so they survive backend restarts and are shared
by the triage, card-detail, and chat agents.

Browserbase is optional — if it is not configured the agent falls back to a
Gemini-only synthesis so the flow still works for a demo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import List, Optional

from app.config import settings
from app.services.browserbase import fetch_page, search_web
from app.services.cache import get_json, location_rag_key, set_json
from app.services.gemini import generate_json

logger = logging.getLogger(__name__)

RESEARCH_SYSTEM = """You are a local waste-and-disposal research agent for the RRR app.
You build a durable knowledge base for ONE location that residents will later query
to learn how to dispose of nontraditional items (furniture, appliances, e-waste,
mattresses, household hazardous waste).
Use the provided web reference material as the primary source of truth. When the
material is thin, you may add well-established general knowledge for that locale,
but never invent specific program names, phone numbers, or URLs.
Capture eligibility CONSTRAINTS precisely (e.g. "Berkeley free bulky pickup requires
a 4-9 unit building and the landlord must call to schedule")."""


def _search_queries(location: str) -> List[str]:
    return [
        f"{location} curbside recycling and trash rules what goes in which bin",
        f"{location} bulky item pickup program eligibility how to schedule",
        f"{location} household hazardous waste and e-waste drop-off locations",
        f"{location} furniture donation pickup charities",
    ]


async def _gather_pages(location: str) -> List[dict]:
    pages: List[dict] = []
    seen: set[str] = set()
    for query in _search_queries(location):
        try:
            results = await asyncio.to_thread(
                search_web, query, num_results=settings.browserbase_search_num_results
            )
        except Exception as exc:  # noqa: BLE001 — Browserbase optional
            logger.warning("Location research search failed (%r): %s", query, exc)
            continue
        for result in results:
            url = result.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            try:
                page = await asyncio.to_thread(fetch_page, url, format="markdown")
                if page.get("content") and page.get("status_code", 0) < 400:
                    pages.append(
                        {
                            "url": url,
                            "title": result.get("title", url),
                            "content": page["content"][:6000],
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Location research fetch failed for %s: %s", url, exc)
            if len(pages) >= 8:
                return pages
    return pages


def _build_prompt(location: str, pages: List[dict]) -> str:
    refs = []
    for i, page in enumerate(pages, 1):
        refs.append(f"{i}. {page['title']}\n   URL: {page['url']}\n   Content:\n{page['content'][:3500]}")
    refs_block = "\n\n".join(refs) if refs else "No page content fetched — use general knowledge for this locale."

    return f"""Build a disposal knowledge base for: {location}

Web reference material:
{refs_block}

Return ONLY valid JSON (no markdown fences) in this exact shape:
{{
  "summary": "2-3 sentence overview of how disposal works in this area",
  "curbside": {{
    "trash": ["short rules about what goes in the landfill/trash bin"],
    "recycling": ["short rules about what goes in the curbside recycling bin"]
  }},
  "docs": [
    {{
      "type": "bulky_pickup | recycling | trash | hhw | ewaste | donation | program",
      "title": "Program or rule name",
      "text": "Concise factual description residents can act on",
      "constraints": ["eligibility or scheduling constraints, if any"],
      "sourceUrl": "https://... or null"
    }}
  ]
}}"""


def _normalize(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("Could not parse location research JSON")
        return {}
    return data if isinstance(data, dict) else {}


async def research_location(zip_code: str, address: str = "") -> dict:
    """Idempotent: returns the persisted RAG for this zip, building it once."""
    key = location_rag_key(zip_code)
    cached = await get_json(key)
    if cached:
        cached["status"] = "cached"
        return cached

    location = address.strip() or zip_code
    logger.info("Researching location RAG for %r", location)

    pages = await _gather_pages(location)
    prompt = _build_prompt(location, pages)
    raw = await generate_json(RESEARCH_SYSTEM, prompt, max_output_tokens=4096)
    data = _normalize(raw)

    record = {
        "zip": zip_code,
        "address": address,
        "location": location,
        "summary": data.get("summary", ""),
        "curbside": data.get("curbside", {"trash": [], "recycling": []}),
        "docs": data.get("docs", []),
        "status": "ready",
    }

    # Persist with NO TTL so the RAG survives restarts (cache_ttl_location_rag=0).
    ttl = settings.cache_ttl_location_rag or None
    await set_json(key, record, ttl=ttl)
    return record


async def get_location_rag(zip_code: str) -> Optional[dict]:
    if not zip_code:
        return None
    return await get_json(location_rag_key(zip_code))


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


async def retrieve_location_rag(zip_code: str, query: str, *, top_k: int = 4) -> dict:
    """Keyword-retrieve the most relevant RAG docs + curbside rules for a query."""
    record = await get_location_rag(zip_code)
    if not record:
        return {"summary": "", "curbside": {"trash": [], "recycling": []}, "docs": []}

    q = _tokens(query)
    scored = []
    for doc in record.get("docs", []):
        doc_tokens = _tokens(f"{doc.get('title', '')} {doc.get('text', '')} {doc.get('type', '')}")
        score = len(q & doc_tokens)
        if score:
            scored.append((score, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    docs = [d for _, d in scored[:top_k]] or record.get("docs", [])[:top_k]

    return {
        "summary": record.get("summary", ""),
        "curbside": record.get("curbside", {"trash": [], "recycling": []}),
        "docs": docs,
    }


def format_rag_context(rag: dict) -> str:
    """Render retrieved RAG into a compact reference block for a prompt."""
    if not rag:
        return "No local knowledge base available."
    lines: List[str] = []
    if rag.get("summary"):
        lines.append(f"Area overview: {rag['summary']}")
    curbside = rag.get("curbside") or {}
    if curbside.get("trash"):
        lines.append("Curbside trash: " + "; ".join(curbside["trash"]))
    if curbside.get("recycling"):
        lines.append("Curbside recycling: " + "; ".join(curbside["recycling"]))
    for doc in rag.get("docs", []):
        cons = doc.get("constraints") or []
        cons_txt = f" Constraints: {'; '.join(cons)}." if cons else ""
        src = f" Source: {doc.get('sourceUrl')}" if doc.get("sourceUrl") else ""
        lines.append(f"[{doc.get('type', 'program')}] {doc.get('title', '')}: {doc.get('text', '')}.{cons_txt}{src}")
    return "\n".join(lines) if lines else "No local knowledge base available."
