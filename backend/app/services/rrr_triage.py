"""
In-home disposal triage (the refined first-pass agent).

Checks, IN ORDER:
  1. Can the user dispose of this at home? If yes → tell them exactly which bin
     ("You can throw that in the trash" / "...in the recycling").
  2. Otherwise → disposableAtHome=false, and the app proceeds to the cards page
     for non-traditional disposal pathways.

Grounded in the persistent location RAG's curbside rules when available.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re

from app.config import settings
from app.schemas.rrr import TriageRequest, TriageResponse
from app.services.cache import get_json, set_json
from app.services.gemini import generate_json
from app.services.rrr_location_research import format_rag_context, retrieve_location_rag

logger = logging.getLogger(__name__)

TRIAGE_SYSTEM = """You are the first-pass disposal triage agent for the RRR app.
A user wants to get rid of an item. Decide the SIMPLEST correct path in this order:

1. CAN THIS GO IN THE USER'S HOME BINS? Small/clean everyday items belong in the
   household trash or curbside recycling (e.g. a cardboard box → recycling, a broken
   ceramic mug → trash, an empty plastic bottle → recycling). If so, set
   disposableAtHome=true and pick exactly one bin: "trash" or "recycling".
2. OTHERWISE the item is large, hazardous, electronic, or otherwise NOT allowed in
   home bins (furniture, appliances, mattresses, e-waste, paint, batteries, etc.).
   Set disposableAtHome=false so the app can research special pathways.

Prefer the local curbside rules in the reference material when they are provided.
Be conservative: if unsure whether it fits in a home bin, set disposableAtHome=false."""


def _cache_key(req: TriageRequest) -> str:
    raw = f"{req.location.lower()}:{req.category}:{req.itemName.lower()}"
    return f"triage:{hashlib.sha256(raw.encode()).hexdigest()}"


def _build_prompt(req: TriageRequest, rag_context: str) -> str:
    return f"""Item: {req.itemName} ({req.category})
Location: {req.location or 'unknown'}

Local curbside reference (may be empty):
{rag_context}

Return ONLY valid JSON (no markdown fences):
{{
  "disposableAtHome": true,
  "bin": "trash" | "recycling" | null,
  "message": "You can throw that in the trash"  // only when disposableAtHome is true
}}"""


def _parse(raw: str) -> TriageResponse:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return TriageResponse(disposableAtHome=False)
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("Could not parse triage JSON")
        return TriageResponse(disposableAtHome=False)

    at_home = bool(data.get("disposableAtHome"))
    bin_val = data.get("bin") if data.get("bin") in ("trash", "recycling") else None
    if at_home and not bin_val:
        bin_val = "trash"
    message = (data.get("message") or "").strip()
    if at_home and not message:
        message = f"You can throw that in the {bin_val}"
    return TriageResponse(disposableAtHome=at_home, bin=bin_val if at_home else None, message=message if at_home else "")


async def triage_item(req: TriageRequest) -> TriageResponse:
    cache_key = _cache_key(req)
    cached = await get_json(cache_key)
    if cached:
        return TriageResponse(**cached)

    rag = await retrieve_location_rag(req.zip, req.itemName)
    rag_context = format_rag_context(rag)

    raw = await generate_json(TRIAGE_SYSTEM, _build_prompt(req, rag_context), max_output_tokens=256)
    result = _parse(raw)

    await set_json(cache_key, result.model_dump(), ttl=settings.cache_ttl_triage)
    return result
