"""
Two cooperating agents that run when a disposal card is tapped.

Agent 1 — research_card_detail: extracts the concrete next steps and key
  eligibility CONSTRAINTS for the chosen pathway (e.g. "Berkeley free bulky
  pickup requires a 4-9 unit building; the landlord must call"). Grounded in the
  persistent location RAG, with a targeted Browserbase fetch of the card's source.

Agent 2 — decide_action: turns Agent 1's research into a single recommended
  course of action for the UI:
    - textual instructions OR constraints present → mode "summary"
      (show summary + recommendation + source link)
    - an online form              → mode "form"  (hand off to Agent S)
    - a phone number              → mode "phone" (show the number to call)

Both calls are Redis-cached, so this is the "two Redis agents" pipeline.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from typing import Tuple

from app.config import settings
from app.schemas.rrr import (
    CardDetail,
    CardDetailRequest,
    CardDetailResponse,
    Recommendation,
)
from app.services.browserbase import fetch_page
from app.services.cache import get_json, set_json
from app.services.gemini import generate_json
from app.services.rrr_location_research import format_rag_context, retrieve_location_rag

logger = logging.getLogger(__name__)

RESEARCH_SYSTEM = """You are the disposal-pathway research agent (Agent 1) for the RRR app.
Given one chosen disposal pathway, extract exactly what the user must do and any
eligibility or scheduling CONSTRAINTS that could block them. Use the local knowledge
base and the fetched page content. Be specific and never invent URLs or phone numbers."""

DECIDE_SYSTEM = """You are the action-planning agent (Agent 2) for the RRR app.
You receive structured research about ONE disposal pathway and write a short,
friendly summary and a single clear recommendation for the user. Be concrete and
mention any constraint they must satisfy first."""


def _cache_key(req: CardDetailRequest) -> str:
    raw = f"{req.location.lower()}:{req.card.method}:{req.card.title.lower()}:{req.itemName.lower()}"
    return f"card_detail:{hashlib.sha256(raw.encode()).hexdigest()}"


def _extract_json(raw: str) -> dict:
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
        logger.warning("Could not parse card-agent JSON")
        return {}
    return data if isinstance(data, dict) else {}


async def _fetch_source(card_url: str | None) -> str:
    if not card_url:
        return ""
    try:
        page = await asyncio.to_thread(fetch_page, card_url, format="markdown")
        if page.get("content") and page.get("status_code", 0) < 400:
            return page["content"][:6000]
    except Exception as exc:  # noqa: BLE001 — Browserbase optional
        logger.warning("Card source fetch failed for %s: %s", card_url, exc)
    return ""


async def research_card_detail(req: CardDetailRequest) -> CardDetail:
    """Agent 1: next steps + constraints for the chosen pathway."""
    card = req.card
    source_url = card.formUrl or None
    rag = await retrieve_location_rag(req.zip, f"{card.method} {card.title} {req.itemName}")
    rag_context = format_rag_context(rag)
    page_content = await _fetch_source(source_url)

    sub = "; ".join(s.name for s in card.subOptions) or "—"
    prompt = f"""Pathway: {card.title} (method: {card.method}, scheduling: {card.schedulingMethod})
Sub-options: {sub}
Item: {req.itemName}
Location: {req.location or 'unknown'}
Known formUrl: {card.formUrl or 'none'}
Known phone: {card.phone or 'none'}

Local knowledge base:
{rag_context}

Fetched source page content (may be empty):
{page_content or 'none'}

Return ONLY valid JSON (no markdown fences):
{{
  "nextSteps": ["ordered concrete steps the user takes"],
  "constraints": ["eligibility/scheduling constraints, [] if none"],
  "summary": "2-3 sentence plain-language summary",
  "sourceUrl": "best official URL or null",
  "formUrl": "online booking form URL or null",
  "phone": "phone number to call or null"
}}"""

    raw = await generate_json(RESEARCH_SYSTEM, prompt, max_output_tokens=1024)
    data = _extract_json(raw)

    return CardDetail(
        nextSteps=[str(s).strip() for s in (data.get("nextSteps") or []) if str(s).strip()],
        constraints=[str(c).strip() for c in (data.get("constraints") or []) if str(c).strip()],
        summary=(data.get("summary") or "").strip(),
        sourceUrl=(data.get("sourceUrl") or card.formUrl or None),
        formUrl=(data.get("formUrl") or card.formUrl or None),
        phone=(data.get("phone") or card.phone or None),
    )


def _route(detail: CardDetail, scheduling: str) -> str:
    """Deterministic routing so the UI mode is reliable.

    Constraints take precedence: the user must understand eligibility before we
    push them into a form. Otherwise honor the actionable channel.
    """
    if detail.constraints:
        return "summary"
    if scheduling == "web_form" and detail.formUrl:
        return "form"
    if scheduling == "phone" and detail.phone:
        return "phone"
    if detail.formUrl:
        return "form"
    if detail.phone:
        return "phone"
    return "summary"


async def decide_action(req: CardDetailRequest, detail: CardDetail) -> Recommendation:
    """Agent 2: summary + recommendation; mode is routed deterministically."""
    mode = _route(detail, req.card.schedulingMethod)

    steps = "\n".join(f"- {s}" for s in detail.nextSteps) or "- (none extracted)"
    cons = "\n".join(f"- {c}" for c in detail.constraints) or "- (none)"
    prompt = f"""Pathway: {req.card.title} for disposing a {req.itemName}.
Chosen UI mode: {mode}

Next steps:
{steps}

Constraints:
{cons}

Write the user-facing copy. Return ONLY valid JSON (no markdown fences):
{{
  "summary": "2-3 sentences describing this option and any constraint to satisfy first",
  "recommendation": "one actionable sentence telling the user what to do next"
}}"""

    raw = await generate_json(DECIDE_SYSTEM, prompt, max_output_tokens=512)
    data = _extract_json(raw)

    return Recommendation(
        mode=mode,  # type: ignore[arg-type]
        summary=(data.get("summary") or detail.summary).strip(),
        recommendation=(data.get("recommendation") or "").strip(),
        sourceUrl=detail.sourceUrl,
        formUrl=detail.formUrl if mode == "form" else None,
        phone=detail.phone if mode == "phone" else None,
    )


async def get_card_detail(req: CardDetailRequest) -> CardDetailResponse:
    cache_key = _cache_key(req)
    cached = await get_json(cache_key)
    if cached:
        return CardDetailResponse(**cached)

    detail = await research_card_detail(req)
    recommendation = await decide_action(req, detail)
    response = CardDetailResponse(detail=detail, recommendation=recommendation)

    await set_json(cache_key, response.model_dump(), ttl=settings.cache_ttl_card_detail)
    return response
