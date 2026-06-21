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
Use the web search results, page content, and local knowledge base as reference material
to find REAL local pathways. Be thorough and surface NICHE, hyper-local, and
category-specific options — not just the obvious ones:
- donation orgs with doorfront pickup + thrift stores (Habitat ReStore, Goodwill,
  Salvation Army)
- free city/collective bulky pickup, and paid junk haulers
- category-specific collectives/take-back: mattress recycling (Bye Bye Mattress),
  e-waste & CRT recyclers, HHW facilities, textile/clothing recyclers, scrap-metal yards,
  PaintCare, battery take-back, creative reuse centers (e.g. East Bay Depot)
- hyper-local & seasonal programs: college move-out donation drives (e.g. UC Berkeley
  "Cal Move-Out"), reuse/rummage events and charity warehouse sales (e.g. Oakland
  "White Elephant Sale"), Buy Nothing / Freecycle groups
Prefer the option best-matched to THIS item's category, and rank reuse/donation above
landfill hauling. Only return pathways that plausibly serve the user's location, and
name specific real programs in subOptions rather than generic placeholders."""

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
    raw = f"{req.location.lower()}:{req.category}:{req.itemName.lower()}:{req.note.lower()}"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"disposal_options:{digest}"


# Category-specific niche searches so item-appropriate collectives/take-back
# programs surface alongside the generic disposal options.
_CATEGORY_QUERIES = {
    "furniture": "furniture donation pickup reuse charity thrift",
    "appliance": "appliance recycling haul-away scrap metal take-back",
    "electronics": "e-waste electronics recycling collective CRT take-back",
    "clothing": "textile clothing recycling donation drop-off",
    "decor": "creative reuse center donation thrift",
    "sports": "sporting goods donation reuse resale",
    "other": "reuse recycling donation drop-off",
}


def _search_queries(req: DisposalOptionsRequest) -> List[str]:
    base = (
        f"{req.location} how to dispose donate recycle bulky pickup junk removal "
        f"{req.itemName} {req.category}"
    )
    category_terms = _CATEGORY_QUERIES.get(req.category, _CATEGORY_QUERIES["other"])
    # A "broken/damaged" note biases the search toward recycling/e-waste over reuse.
    broken = any(w in req.note.lower() for w in ("broken", "damag", "cracked", "not work", "dead", "won't"))
    if broken:
        category_terms = f"{category_terms} broken not working recycling e-waste"
    return [
        base,
        f"{req.location} {req.itemName} {category_terms}",
        f"{req.location} reuse collective mattress HHW e-waste move-out white elephant donation",
    ]


async def discover_disposal_options(req: DisposalOptionsRequest) -> List[DisposalCard]:
    cache_key = _cache_key(req)
    cached = await get_json(cache_key)
    if cached:
        return [DisposalCard(**c) for c in cached]

    pages: List[dict] = []
    seen: set[str] = set()
    for query in _search_queries(req):
        if len(pages) >= 8:
            break
        logger.info("Disposal options search: %r", query)
        try:
            results = await asyncio.to_thread(
                search_web,
                query,
                num_results=max(settings.browserbase_search_num_results, 5),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Disposal search failed (%r): %s", query, exc)
            capture_silent_failure(
                exc, where="browserbase.search_web", query=query, stage="disposal_options"
            )
            continue
        added_for_query = 0
        for result in results:
            if added_for_query >= 3 or len(pages) >= 8:
                break
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
                            "content": page["content"][:8000],
                        }
                    )
                    added_for_query += 1
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

    note_line = ""
    if req.note.strip():
        note_line = (
            f'\nUser note about condition: "{req.note}". If the item is broken or damaged, '
            f"rank repair/recycling/e-waste pathways above donation/resale (charities cannot "
            f"accept non-working items) and say so.\n"
        )

    return f"""Find 3-6 real disposal pathways for this user and rank them best-first
(reuse/donation above paid hauling above landfill).

Item: {req.itemName} ({req.category})
Location: {req.location}{note_line}
{rag_block}
Web reference material:
{refs_block}

Each card groups one METHOD; put the specific, real, named local programs you found in
its subOptions (e.g. donation → "Cal Move-Out", "Oakland White Elephant Sale", "Habitat
ReStore"; recycling_collective → a mattress or creative-reuse collective; ewaste → a
local e-waste collective; hhw → the county HHW facility). Include the niche and
category-specific options that fit a {req.category} item — do not collapse everything
into generic "donation" / "junk haulers" cards. Use null for any stat you can't ground.

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
