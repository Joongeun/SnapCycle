"""
Disposal-options discovery for the RRR mobile app.

Runs the real RAG path: Browserbase web search + page fetch for local disposal
*pathways* (donation, city/collective pickup, paid haulers, recycling, HHW,
e-waste, hyper-local programs), Redis cache-aside, and Gemini synthesis into a
ranked list of DisposalCards. Mirrors rrr_service_discovery.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from typing import List

from app.config import settings
from app.observability import capture_silent_failure
from app.schemas.rrr import DisposalCard, DisposalCardStats, DisposalOptionsRequest, DisposalSubOption
from app.services.browserbase import fetch_page, search_web
from app.services.cache import get_json, set_json
from app.services.gemini import generate_json
from app.services.rrr_location_research import format_rag_context, retrieve_location_rag

logger = logging.getLogger(__name__)

DISPOSAL_SYSTEM = """You are a local disposal-pathways agent for the RRR mobile app.
Users want to responsibly get rid of a large/nontraditional item (furniture, appliances,
e-waste, household hazardous waste, mattresses, etc.).
Use the web search results and page content as reference material to find REAL local
pathways: donation orgs, free city/collective bulky pickup, paid junk haulers, recycling
collectives, HHW and e-waste drop-off, and hyper-local programs.
Only return pathways that plausibly serve the user's location."""

VALID_METHODS = {
    "donation",
    "city_bulky_pickup",
    "junk_haulers",
    "recycling_collective",
    "hhw",
    "ewaste",
}
VALID_SCHEDULING = {"web_form", "phone", "hauler_bids"}


def _cache_key(req: DisposalOptionsRequest) -> str:
    raw = f"{req.location.lower()}:{req.category}:{req.itemName.lower()}"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"disposal_options:{digest}"


def _search_query(req: DisposalOptionsRequest) -> str:
    return (
        f"{req.location} how to dispose donate recycle bulky pickup junk removal "
        f"{req.itemName} {req.category}"
    )


async def discover_disposal_options(req: DisposalOptionsRequest) -> List[DisposalCard]:
    cache_key = _cache_key(req)
    cached = await get_json(cache_key)
    if cached:
        return [DisposalCard(**c) for c in cached]

    query = _search_query(req)
    logger.info("Disposal options search: %r", query)

    results = await asyncio.to_thread(
        search_web,
        query,
        num_results=max(settings.browserbase_search_num_results, 5),
    )

    pages: List[dict] = []
    for result in results:
        url = result.get("url")
        if not url:
            continue
        try:
            page = await asyncio.to_thread(fetch_page, url, format="markdown")
            if page.get("content") and page.get("status_code", 0) < 400:
                pages.append(
                    {
                        "url": url,
                        "title": result.get("title", url),
                        "content": page["content"][:8000],
                    }
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Fetch failed for %s: %s", url, exc)
            capture_silent_failure(
                exc, where="browserbase.fetch_page", url=url, stage="disposal_options"
            )

    rag = await retrieve_location_rag(req.zip, f"{req.itemName} {req.category}")
    prompt = _build_prompt(req, pages, format_rag_context(rag))
    raw = await generate_json(DISPOSAL_SYSTEM, prompt, max_output_tokens=4096)
    cards = _parse_cards(raw)

    if cards:
        await set_json(
            cache_key,
            [c.model_dump() for c in cards],
            ttl=settings.cache_ttl_disposal_options,
        )

    return cards


def _build_prompt(req: DisposalOptionsRequest, pages: List[dict], rag_context: str = "") -> str:
    refs = []
    for i, page in enumerate(pages, 1):
        refs.append(f"{i}. {page['title']}\n   URL: {page['url']}\n   Content:\n{page['content'][:4000]}")
    refs_block = "\n\n".join(refs) if refs else "No page content fetched — use general knowledge for the location."

    rag_block = f"\nLocal knowledge base (researched at onboarding — prefer this):\n{rag_context}\n" if rag_context and "No local knowledge base" not in rag_context else ""

    return f"""Find 3-6 real disposal pathways for this user and rank them best-first.

Item: {req.itemName} ({req.category})
Location: {req.location}
{rag_block}
Web reference material:
{refs_block}

For each pathway estimate the stats honestly (use null when unknown):
- costUsd: typical out-of-pocket cost in USD, or null if free
- ecoScore: 0-100 (donation/reuse highest, landfill hauling lowest)
- doorfrontPickup: true if they pick up at the curb/door
- driveDistanceMi: approx miles the user would drive, or null if they pick up

schedulingMethod must be one of:
- "web_form" when the user books via an online form (set formUrl)
- "phone" when the user must call (set phone)
- "hauler_bids" ONLY for the paid junk-hauler pathway

method must be one of: donation, city_bulky_pickup, junk_haulers, recycling_collective, hhw, ewaste

Return ONLY valid JSON (no markdown fences) in this exact shape:
{{
  "cards": [
    {{
      "method": "donation",
      "title": "Donation",
      "stats": {{ "costUsd": null, "ecoScore": 88, "doorfrontPickup": true, "driveDistanceMi": 2.1 }},
      "subOptions": [{{ "name": "Habitat for Humanity ReStore", "note": "Free doorfront pickup" }}],
      "schedulingMethod": "web_form",
      "formUrl": "https://...",
      "phone": null
    }}
  ]
}}"""


def _parse_cards(raw: str) -> List[DisposalCard]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return []

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        logger.warning("Could not parse disposal cards JSON from model output")
        capture_silent_failure(
            exc,
            where="gemini.parse_disposal_cards_json",
            raw_snippet=text[:500],
        )
        return []

    cards: List[DisposalCard] = []
    for item in data.get("cards", [])[:6]:
        method = str(item.get("method", "")).strip()
        scheduling = str(item.get("schedulingMethod", "")).strip()
        if method not in VALID_METHODS or scheduling not in VALID_SCHEDULING:
            continue
        stats_raw = item.get("stats") or {}
        try:
            stats = DisposalCardStats(
                costUsd=stats_raw.get("costUsd"),
                ecoScore=int(stats_raw.get("ecoScore", 50)),
                doorfrontPickup=bool(stats_raw.get("doorfrontPickup", False)),
                driveDistanceMi=stats_raw.get("driveDistanceMi"),
            )
        except (TypeError, ValueError):
            continue
        sub_options = [
            DisposalSubOption(name=str(s.get("name", "")).strip(), note=(s.get("note") or None))
            for s in (item.get("subOptions") or [])
            if str(s.get("name", "")).strip()
        ]
        cards.append(
            DisposalCard(
                method=method,  # type: ignore[arg-type]
                title=str(item.get("title") or method).strip(),
                stats=stats,
                subOptions=sub_options,
                schedulingMethod=scheduling,  # type: ignore[arg-type]
                phone=(item.get("phone") or None),
                formUrl=(item.get("formUrl") or None),
            )
        )
    return cards
