from __future__ import annotations

import re
from typing import List, Optional


RESEARCH_SYSTEM = """You are a local recycling and waste disposal expert.
You receive web research about how a city handles a specific item.
Give clear, practical cycling/recycling/disposal instructions for residents.
Base answers ONLY on the research provided. If unclear, say so and give the safest option."""


def build_recycling_research_prompt(
    *,
    city: str,
    region: str,
    item: str,
    item_id: str,
    pages: List[dict],
) -> str:
    research_block = _format_pages(pages)

    return f"""Location: {city}, {region}
Item (user said): "{item}"
Standardized item ID: {item_id}

Web research from official and local sources:
{research_block}

Based ONLY on the research above, tell the user how to cycle / recycle / dispose of this item in {city}.

Respond in this exact format:
ACCEPTED: [true or false]
CATEGORY: [recyclable | compost | landfill | special | unknown]
INSTRUCTIONS: [1-2 sentence summary for the user]
STEPS:
- [step 1]
- [step 2]
- [step 3 if needed]
NOTES: [important caveats, drop-off locations, or "none"]
SOURCES:
- [url or source title used]
"""


def _format_pages(pages: List[dict]) -> str:
    if not pages:
        return "No web pages could be retrieved."

    parts = []
    for i, page in enumerate(pages, 1):
        parts.append(
            f"{i}. {page.get('title', 'Untitled')}\n"
            f"   URL: {page.get('url')}\n"
            f"   Content:\n{page.get('content', '')[:5000]}"
        )
    return "\n\n".join(parts)
