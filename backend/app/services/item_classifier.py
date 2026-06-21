from __future__ import annotations

import re
from typing import List, Set

from app.services.gemini import generate
from app.services.location import get_location_data, list_locations

CLASSIFY_SYSTEM = """You classify waste items into standardized global item IDs.
Return ONLY the item_id string — no explanation, no punctuation, no markdown.
Use lowercase snake_case or hyphenated IDs (e.g. plastic_bottle_pet, aluminum_can, plastic_film_foil).
Prefer matching an existing ID from the taxonomy when the item clearly fits."""


def _collect_taxonomy() -> List[str]:
    ids: Set[str] = set()
    for loc_id in list_locations():
        loc = get_location_data(loc_id)
        if not loc:
            continue
        for doc in loc.get("documents", []):
            ids.add(doc["id"])
    return sorted(ids)


async def classify_item(query: str) -> str:
    """
    Cache miss brain: map free-text query to a standardized global item_id via LLM.
    """
    taxonomy = _collect_taxonomy()
    taxonomy_block = "\n".join(f"- {item_id}" for item_id in taxonomy)

    prompt = f"""User query: "{query}"

Known item IDs:
{taxonomy_block}

Return the best matching item_id. If none fit well, invent a descriptive snake_case id."""

    raw = await generate(CLASSIFY_SYSTEM, prompt)
    item_id = _sanitize_item_id(raw)
    return item_id


def _sanitize_item_id(raw: str) -> str:
    cleaned = raw.strip().lower()
    cleaned = re.sub(r"[^a-z0-9_-]", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "unknown_item"
