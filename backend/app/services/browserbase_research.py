from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

from app.agent.research_prompts import RESEARCH_SYSTEM, build_recycling_research_prompt
from app.config import settings
from app.services.browserbase import fetch_page, search_web
from app.services.gemini import generate

logger = logging.getLogger(__name__)


async def research_recycling_rule(
    *,
    city: str,
    region: str,
    item: str,
    item_id: str,
) -> Dict[str, Any]:
    """
    Browserbase web search → fetch top pages → Gemini → structured rule.
    Used when city is unknown or rule not in Redis/local JSON.
    """
    search_query = f"{city} {region} recycling disposal how to recycle {item}"
    logger.info("Browserbase research: %r", search_query)

    results = await asyncio.to_thread(
        search_web,
        search_query,
        num_results=settings.browserbase_search_num_results,
    )

    pages: List[dict] = []
    for result in results:
        url = result.get("url")
        if not url:
            continue
        try:
            page = await asyncio.to_thread(fetch_page, url, format="markdown")
            if page.get("content") and page.get("status_code", 0) < 400:
                pages.append({
                    "url": url,
                    "title": result.get("title", url),
                    "content": page["content"],
                })
        except Exception as exc:
            logger.warning("Fetch failed for %s: %s", url, exc)

    prompt = build_recycling_research_prompt(
        city=city,
        region=region,
        item=item,
        item_id=item_id,
        pages=pages,
    )

    raw = await generate(RESEARCH_SYSTEM, prompt, max_output_tokens=2048)
    rule = _parse_research_response(raw, item_id=item_id, pages=pages)
    rule["research_query"] = search_query
    rule["source"] = "browserbase"
    return rule


def _parse_research_response(
    text: str,
    *,
    item_id: str,
    pages: List[dict],
) -> Dict[str, Any]:
    category = _extract(text, "CATEGORY", "unknown").lower()
    accepted_raw = _extract(text, "ACCEPTED", "false").lower()
    accepted = accepted_raw in ("true", "yes")

    steps: List[str] = []
    sources: List[str] = []
    in_steps = False
    in_sources = False

    for line in text.split("\n"):
        s = line.strip()
        upper = s.upper()
        if upper.startswith("STEPS:"):
            in_steps, in_sources = True, False
            continue
        if upper.startswith("NOTES:"):
            in_steps, in_sources = False, False
            continue
        if upper.startswith("SOURCES:"):
            in_steps, in_sources = False, True
            continue
        if in_steps and s.startswith(("- ", "* ")):
            steps.append(s[2:].strip())
        if in_sources and s.startswith(("- ", "* ")):
            sources.append(s[2:].strip())

    if not sources and pages:
        sources = [p["url"] for p in pages[:3]]

    return {
        "accepted": accepted,
        "item_id": item_id,
        "category": category,
        "instructions": _extract(text, "INSTRUCTIONS", text.strip()),
        "steps": steps,
        "sources": sources,
        "notes": _extract(text, "NOTES", ""),
    }


def _extract(text: str, field: str, default: str = "") -> str:
    match = re.search(rf"{field}:\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    return match.group(1).strip() if match else default
