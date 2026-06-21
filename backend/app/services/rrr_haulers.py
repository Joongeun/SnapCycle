"""
Yelp Fusion proxy for the junk-hauler pathway.

Yelp's Fusion API is read-only (no consumer→business messaging), so we surface the
top local junk-removal businesses with phone numbers for tap-to-call. Needs
YELP_API_KEY; returns [] gracefully when it is missing or the call fails.
"""

from __future__ import annotations

import logging
from typing import List

import httpx

from app.config import settings
from app.observability import capture_silent_failure
from app.schemas.rrr import Hauler, HaulersRequest

logger = logging.getLogger(__name__)

YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
METERS_PER_MILE = 1609.34


async def find_haulers(req: HaulersRequest) -> List[Hauler]:
    if not settings.yelp_api_key:
        logger.warning("YELP_API_KEY not set — returning no haulers")
        capture_silent_failure(
            RuntimeError("YELP_API_KEY not set — hauler list silently returned empty"),
            where="yelp.find_haulers",
            reason="missing_api_key",
            location=req.location,
        )
        return []

    params = {
        "term": "junk removal hauling",
        "location": req.location,
        "categories": "junk_removal_and_demolition,junkremoval",
        "sort_by": "best_match",
        "limit": 5,
    }
    headers = {"Authorization": f"Bearer {settings.yelp_api_key}"}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(YELP_SEARCH_URL, params=params, headers=headers)
        if resp.status_code != 200:
            logger.warning("Yelp search failed: HTTP %s", resp.status_code)
            capture_silent_failure(
                RuntimeError(f"Yelp Fusion search returned HTTP {resp.status_code}"),
                where="yelp.find_haulers",
                reason="bad_status",
                status_code=resp.status_code,
                location=req.location,
            )
            return []
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Yelp request error: %s", exc)
        capture_silent_failure(
            exc, where="yelp.find_haulers", reason="request_error", location=req.location
        )
        return []

    haulers: List[Hauler] = []
    for biz in data.get("businesses", [])[:5]:
        phone = biz.get("display_phone") or biz.get("phone") or ""
        if not phone:
            continue
        distance_m = biz.get("distance")
        distance_mi = round(distance_m / METERS_PER_MILE, 1) if isinstance(distance_m, (int, float)) else 0.0
        haulers.append(
            Hauler(
                haulerName=biz.get("name", "Junk hauler"),
                rating=float(biz.get("rating", 0) or 0),
                distanceMi=distance_mi,
                phone=phone,
                url=biz.get("url"),
            )
        )
    return haulers
