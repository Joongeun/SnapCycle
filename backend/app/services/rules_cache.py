from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.agent.prompts import AGENT_SYSTEM
from app.observability import capture_silent_failure
from app.services.browserbase_research import research_recycling_rule
from app.services.gemini import generate
from app.services.location import get_location_data


async def get_rule(location_id: str, item_id: str) -> Optional[Dict[str, Any]]:
    from app.services.cache import get_json, rule_key

    return await get_json(rule_key(location_id, item_id))


async def save_rule(location_id: str, item_id: str, rule: Dict[str, Any]) -> None:
    from app.services.cache import rule_key, set_json

    await set_json(rule_key(location_id, item_id), rule, ttl=None)


async def fetch_and_cache_rule(
    location_id: str,
    item_id: str,
    *,
    original_query: str,
    city: Optional[str] = None,
    region: Optional[str] = None,
    dynamic: bool = False,
) -> Dict[str, Any]:
    """
    Cache miss: local JSON → Browserbase web research → LLM fallback.
    """
    cached = await get_rule(location_id, item_id)
    if cached:
        return cached

    location = get_location_data(location_id)
    if location is None and not dynamic:
        location = {"name": f"{city}, {region}", "city": city, "region": region, "dynamic": True}

    doc = _find_document(location, item_id) if location and location.get("documents") else None

    if doc:
        rule = _rule_from_document(doc)
    else:
        resolved_city, resolved_region = _resolve_city_region(city, region, location)
        if resolved_city:
            try:
                rule = await research_recycling_rule(
                    city=resolved_city,
                    region=resolved_region or resolved_city,
                    item=original_query,
                    item_id=item_id,
                )
            except Exception as exc:
                capture_silent_failure(
                    exc,
                    where="browserbase.research_recycling_rule",
                    item_id=item_id,
                    city=resolved_city,
                    region=resolved_region,
                    fallback="llm" if location else "raise",
                )
                if location:
                    rule = await _rule_from_llm(location, item_id, original_query)
                else:
                    raise
        elif location:
            rule = await _rule_from_llm(location, item_id, original_query)
        else:
            raise ValueError(f"Cannot resolve rules for location: {location_id}")

    await save_rule(location_id, item_id, rule)
    return rule


def _resolve_city_region(
    city: Optional[str],
    region: Optional[str],
    location: Optional[dict],
) -> Tuple[str, str]:
    if city:
        return city, region or ""

    if not location:
        return "", ""

    if location.get("city"):
        return location["city"], region or location.get("region") or location.get("jurisdiction", "")

    name = location.get("name", "")
    parts = [p.strip() for p in name.split(",")]
    parsed_city = parts[0] if parts else name
    parsed_region = parts[1] if len(parts) > 1 else location.get("jurisdiction", "")
    return parsed_city, region or parsed_region


def _find_document(location: dict, item_id: str) -> Optional[dict]:
    documents = location.get("documents", [])
    normalized_target = item_id.replace("_", "-")

    for doc in documents:
        doc_id = doc.get("id", "")
        if doc_id == item_id or doc_id == normalized_target:
            return doc
        if doc_id.replace("-", "_") == item_id.replace("-", "_"):
            return doc

    query_tokens = set(item_id.replace("_", " ").replace("-", " ").split())
    best_doc: Optional[dict] = None
    best_score = 0

    for doc in documents:
        score = 0
        doc_id = doc.get("id", "").replace("-", " ")
        doc_tokens = set(doc_id.split())
        score += len(query_tokens & doc_tokens) * 2

        for kw in doc.get("keywords", []):
            kw_tokens = set(kw.lower().split())
            score += len(query_tokens & kw_tokens)

        if score > best_score:
            best_score = score
            best_doc = doc

    return best_doc if best_score >= 2 else None


def _rule_from_document(doc: dict) -> Dict[str, Any]:
    category = doc.get("category", "unknown")
    accepted = category in ("recyclable", "compost")
    return {
        "accepted": accepted,
        "item_id": doc.get("id"),
        "category": category,
        "instructions": doc.get("instructions", ""),
        "steps": _steps_from_instructions(doc.get("instructions", "")),
        "sources": [doc.get("title", doc.get("id", ""))],
        "notes": doc.get("notes") or "",
        "source": "local_json",
    }


def _steps_from_instructions(instructions: str) -> List[str]:
    parts = [p.strip() for p in re.split(r"[.;]", instructions) if p.strip()]
    return parts[:4] if parts else [instructions] if instructions else []


async def _rule_from_llm(location: dict, item_id: str, query: str) -> Dict[str, Any]:
    prompt = f"""Location: {location['name']} ({location.get('jurisdiction', '')})
Item ID: {item_id}
User described it as: "{query}"

Provide local disposal rules for this item at this location.

Respond in this format:
ACCEPTED: [true or false]
CATEGORY: [recyclable | compost | landfill | special | unknown]
INSTRUCTIONS: [1-2 sentences]
STEPS:
- [step 1]
- [step 2]
NOTES: [caveats or none]"""

    raw = await generate(AGENT_SYSTEM, prompt)
    category = _extract(raw, "CATEGORY", "unknown").lower()
    accepted_raw = _extract(raw, "ACCEPTED", "false").lower()
    accepted = accepted_raw in ("true", "yes")

    steps: List[str] = []
    in_steps = False
    for line in raw.split("\n"):
        s = line.strip()
        if s.upper().startswith("STEPS:"):
            in_steps = True
            continue
        if in_steps:
            if s.upper().startswith("NOTES:"):
                break
            if s.startswith(("- ", "* ")):
                steps.append(s[2:].strip())

    return {
        "accepted": accepted,
        "item_id": item_id,
        "category": category,
        "instructions": _extract(raw, "INSTRUCTIONS", raw.strip()),
        "steps": steps,
        "sources": [f"LLM inference for {location['name']}"],
        "notes": _extract(raw, "NOTES", ""),
        "source": "llm",
    }


def _extract(text: str, field: str, default: str = "") -> str:
    match = re.search(rf"{field}:\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    return match.group(1).strip() if match else default
