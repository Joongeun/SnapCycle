from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from typing import List

from app.config import settings
from app.observability import capture_silent_failure
from app.schemas.rrr import ServiceOption, ServicesRequest
from app.services.browserbase import fetch_page, search_web
from app.services.cache import get_json, set_json
from app.services.gemini import generate

logger = logging.getLogger(__name__)

DISCOVERY_SYSTEM = """You are a local service discovery agent for the RRR mobile app.
Users want to donate, sell, or discard large household items.
Use the web search results and page content as reference material — verify details when possible.
Return real, currently-operating services with working URLs.
Prefer reputable local options with clear contact info."""


def _services_cache_key(req: ServicesRequest) -> str:
    raw = (
        f"{req.decision}:{req.location.lower()}:{req.category}:"
        f"{req.condition}:{req.itemName.lower()}"
    )
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"services:{digest}"


def _action_phrase(decision: str) -> str:
    if decision == "DONATE":
        return "donate to a local charity, nonprofit, or pickup service"
    if decision == "SELL":
        return "sell on a marketplace or through a consignment/resale service"
    return "responsibly dispose of, recycle, or have hauled away"


def _search_query(req: ServicesRequest) -> str:
    action = {
        "DONATE": "donate pickup charity",
        "SELL": "sell consignment marketplace",
        "DISCARD": "dispose haul away recycle bulk pickup",
    }[req.decision]
    return (
        f"{req.location} {action} {req.itemName} {req.category} "
        f"{req.condition} condition"
    )


async def discover_services(req: ServicesRequest) -> List[ServiceOption]:
    cache_key = _services_cache_key(req)
    cached = await get_json(cache_key)
    if cached:
        return [ServiceOption(**s) for s in cached]

    query = _search_query(req)
    logger.info("Service discovery search: %r", query)

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
        except Exception as exc:
            logger.warning("Fetch failed for %s: %s", url, exc)
            capture_silent_failure(
                exc, where="browserbase.fetch_page", url=url, stage="service_discovery"
            )

    prompt = _build_prompt(req, pages)
    raw = await generate(DISCOVERY_SYSTEM, prompt, max_output_tokens=4096)
    services = _parse_services(raw)

    if services:
        await set_json(
            cache_key,
            [s.model_dump() for s in services],
            ttl=settings.cache_ttl_disposal_options,
        )

    return services


def _build_prompt(req: ServicesRequest, pages: List[dict]) -> str:
    refs = []
    for i, page in enumerate(pages, 1):
        refs.append(
            f"{i}. {page['title']}\n"
            f"   URL: {page['url']}\n"
            f"   Content:\n{page['content'][:4000]}"
        )
    refs_block = "\n\n".join(refs) if refs else "No page content fetched."

    return f"""Find 3-5 real services for this user.

Item: {req.itemName} ({req.category}, {req.condition} condition)
Decision: {req.decision} — user wants to {_action_phrase(req.decision)}
Location: {req.location}

Web reference material:
{refs_block}

Return ONLY valid JSON in this exact shape (no markdown fences):
{{
  "services": [
    {{
      "name": "Service name",
      "description": "One sentence on what they offer",
      "url": "https://...",
      "phone": "optional phone",
      "address": "optional address"
    }}
  ]
}}"""


def _parse_services(raw: str) -> List[ServiceOption]:
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
        logger.warning("Could not parse services JSON from model output")
        capture_silent_failure(
            exc,
            where="gemini.parse_services_json",
            raw_snippet=text[:500],
        )
        return []

    services: List[ServiceOption] = []
    for item in data.get("services", [])[:5]:
        name = (item.get("name") or "").strip()
        url = (item.get("url") or "").strip()
        description = (item.get("description") or "").strip()
        if not name or not url:
            continue
        services.append(
            ServiceOption(
                name=name,
                description=description or name,
                url=url,
                phone=(item.get("phone") or None),
                address=(item.get("address") or None),
            )
        )
    return services
