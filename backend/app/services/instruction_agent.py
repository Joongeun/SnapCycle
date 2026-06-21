from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.prompts import AGENT_SYSTEM, build_agent_instruction_prompt
from app.services.browserbase_research import research_recycling_rule
from app.services.gemini import generate
from app.services.location import get_location_data


async def gather_references(
    location_id: str,
    item_id: str,
    *,
    original_query: str,
    city: Optional[str] = None,
    region: Optional[str] = None,
    location: Optional[dict] = None,
    dynamic: bool = False,
) -> Tuple[List[Dict[str, Any]], bool, bool]:
    """
    Collect reference material from Redis, local JSON, and Browserbase.
    Returns (references, redis_hit, browserbase_used).
    Does NOT return final instructions — references only.
    """
    from app.services.cache import rule_key, set_json
    from app.services.rules_cache import get_rule, _find_document, _rule_from_document, _resolve_city_region

    references: List[Dict[str, Any]] = []
    redis_hit = False
    browserbase_used = False

    cached = await get_rule(location_id, item_id)
    if cached:
        redis_hit = True
        references.append({**cached, "ref_type": "redis_cache"})

    loc = location or get_location_data(location_id)
    if loc and loc.get("documents"):
        doc = _find_document(loc, item_id)
        if doc:
            local = _rule_from_document(doc)
            local["ref_type"] = "local_json"
            if not _reference_duplicate(references, local):
                references.append(local)

    # Fetch live web research when dynamic city or no references yet
    if dynamic or not references:
        resolved_city, resolved_region = _resolve_city_region(city, region, loc)
        if resolved_city:
            try:
                research = await research_recycling_rule(
                    city=resolved_city,
                    region=resolved_region or resolved_city,
                    item=original_query,
                    item_id=item_id,
                )
                research["ref_type"] = "browserbase"
                browserbase_used = True
                references.append(research)
                # Cache research for future reference lookups (not as final answer)
                await set_json(rule_key(location_id, item_id), research, ttl=None)
            except Exception:
                pass

    return references, redis_hit, browserbase_used


async def synthesize_instructions(
    *,
    item: str,
    item_id: str,
    location_name: str,
    jurisdiction: str,
    references: List[Dict[str, Any]],
    from_image: bool = False,
) -> Dict[str, Any]:
    """AI agent: use cached references as context, always produce fresh instructions."""
    prompt = build_agent_instruction_prompt(
        item=item,
        item_id=item_id,
        location_name=location_name,
        jurisdiction=jurisdiction,
        references=references,
        from_image=from_image,
    )

    raw = await generate(AGENT_SYSTEM, prompt, max_output_tokens=2048)
    return _parse_agent_response(raw, item_id=item_id, references=references)


def _reference_duplicate(refs: List[dict], candidate: dict) -> bool:
    key = (candidate.get("instructions"), candidate.get("category"))
    return any((r.get("instructions"), r.get("category")) == key for r in refs)


def _parse_agent_response(
    text: str,
    *,
    item_id: str,
    references: List[dict],
) -> Dict[str, Any]:
    category = _extract(text, "CATEGORY", "unknown").lower()
    accepted_raw = _extract(text, "ACCEPTED", "false").lower()
    accepted = accepted_raw in ("true", "yes")

    steps: List[str] = []
    in_steps = False
    for line in text.split("\n"):
        s = line.strip()
        if s.upper().startswith("STEPS:"):
            in_steps = True
            continue
        if in_steps:
            if s.upper().startswith("NOTES:"):
                break
            if s.startswith(("- ", "* ")):
                steps.append(s[2:].strip())

    sources = []
    for ref in references:
        for src in ref.get("sources", []):
            if src not in sources:
                sources.append(src)
    if not sources:
        sources = [f"AI synthesis using {len(references)} reference(s)"]

    return {
        "accepted": accepted,
        "item_id": item_id,
        "category": category,
        "instructions": _extract(text, "INSTRUCTIONS", text.strip()),
        "steps": steps,
        "notes": _extract(text, "NOTES", ""),
        "sources": sources,
        "source": "ai_agent",
    }


def _extract(text: str, field: str, default: str = "") -> str:
    match = re.search(rf"{field}:\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    return match.group(1).strip() if match else default
