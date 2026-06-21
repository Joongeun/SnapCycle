from __future__ import annotations

import asyncio
from typing import Optional

from app.agent.disposal_prompts import DISPOSAL_SEARCH_SYSTEM, build_disposal_search_prompt
from app.config import settings
from app.services.browserbase import fetch_page
from app.services.cache import disposal_options_key, get_json, set_json
from app.services.gemini import generate_sync


async def search_disposal_options(
    url: str,
    *,
    location_hint: Optional[str] = None,
) -> dict:
    """
    Fetch a recycling/waste website and extract reuse, repair,
    recycling, and safe disposal options using Gemini.
    """
    cache_key = disposal_options_key(url, location_hint)
    cached = await get_json(cache_key)
    if cached:
        return {**cached, "cached": True}

    page = await asyncio.to_thread(fetch_page, url, format="markdown")
    if not page["content"]:
        raise ValueError(f"No content retrieved from {url} (status {page['status_code']})")

    prompt = build_disposal_search_prompt(
        url=url,
        page_content=page["content"],
        location_hint=location_hint,
    )

    analysis = await asyncio.to_thread(
        generate_sync, DISPOSAL_SEARCH_SYSTEM, prompt, max_output_tokens=2048
    )

    result = {
        "url": url,
        "status_code": page["status_code"],
        "location_hint": location_hint,
        "options": analysis,
        "content_length": len(page["content"]),
        "cached": False,
    }

    await set_json(cache_key, {k: v for k, v in result.items() if k != "cached"}, settings.cache_ttl_disposal_options)
    return result
