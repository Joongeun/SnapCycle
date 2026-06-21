"""
Redis-backed long-term agent memory for per-user disposal preferences.

Learns from request history (card picks, completed disposals, service searches)
and exposes inferred tags for the mobile dashboard. Persists with no TTL.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from app.observability import capture_silent_failure
from app.services.cache import get_json, set_json

logger = logging.getLogger(__name__)

EventType = Literal["card_selected", "disposal_completed", "service_search", "triage_home"]

METHOD_TO_DECISION = {
    "donation": "DONATE",
    "city_bulky_pickup": "DISCARD",
    "junk_haulers": "DISCARD",
    "recycling_collective": "DISCARD",
    "hhw": "DISCARD",
    "ewaste": "DISCARD",
}

METHOD_TO_PICKUP = {
    "donation": "donation_pickup",
    "city_bulky_pickup": "curbside",
    "junk_haulers": "hauler",
    "recycling_collective": "dropoff",
    "hhw": "dropoff",
    "ewaste": "dropoff",
}

PICKUP_LABELS = {
    "curbside": "Curbside / bulky pickup",
    "dropoff": "Drop-off / recycling center",
    "donation_pickup": "Donation pickup",
    "hauler": "Junk hauler",
}

DECISION_LABELS = {
    "DONATE": "Prefers to donate",
    "SELL": "Prefers to sell",
    "DISCARD": "Prefers to dispose",
}

CATEGORY_LABELS = {
    "furniture": "Furniture",
    "appliance": "Appliances",
    "electronics": "Electronics",
    "clothing": "Clothing",
    "decor": "Decor",
    "sports": "Sports gear",
    "other": "Other",
}


def user_memory_key(user_id: str) -> str:
    return f"user_memory:{user_id}"


def _empty_memory() -> dict:
    return {
        "decision_counts": {"DONATE": 0, "SELL": 0, "DISCARD": 0},
        "method_counts": {},
        "category_counts": {},
        "pickup_counts": {},
        "recent_events": [],
        "total_events": 0,
        "updated_at": None,
    }


async def _load(user_id: str) -> dict:
    raw = await get_json(user_memory_key(user_id))
    if not raw:
        return _empty_memory()
    base = _empty_memory()
    base.update({k: v for k, v in raw.items() if k in base or k == "recent_events"})
    return base


async def record_preference_event(
    user_id: str,
    *,
    event: EventType,
    item_name: str = "",
    category: str = "",
    disposal_method: Optional[str] = None,
    decision: Optional[str] = None,
    location: str = "",
    zip_code: str = "",
) -> None:
    """Append an interaction and update rolling preference counters."""
    if not user_id:
        return

    mem = await _load(user_id)

    resolved_decision = decision
    if not resolved_decision and disposal_method:
        resolved_decision = METHOD_TO_DECISION.get(disposal_method)

    pickup = METHOD_TO_PICKUP.get(disposal_method or "") if disposal_method else None

    if resolved_decision:
        mem["decision_counts"][resolved_decision] = mem["decision_counts"].get(resolved_decision, 0) + 1
    if disposal_method:
        mem["method_counts"][disposal_method] = mem["method_counts"].get(disposal_method, 0) + 1
    if category:
        mem["category_counts"][category] = mem["category_counts"].get(category, 0) + 1
    if pickup:
        mem["pickup_counts"][pickup] = mem["pickup_counts"].get(pickup, 0) + 1

    mem["recent_events"] = [
        {
            "event": event,
            "itemName": item_name,
            "category": category,
            "method": disposal_method,
            "decision": resolved_decision,
            "location": location,
            "zip": zip_code,
            "at": datetime.now(timezone.utc).isoformat(),
        },
        *mem.get("recent_events", [])[:19],
    ]
    mem["total_events"] = int(mem.get("total_events", 0)) + 1
    mem["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        await set_json(user_memory_key(user_id), mem, ttl=None)
        logger.info("Recorded preference event for %s: %s", user_id[:8], event)
    except Exception as exc:
        capture_silent_failure(exc, where="redis.user_memory.write", user_id=user_id[:8])


def _top_key(counter: Dict[str, int], min_count: int = 1) -> Optional[str]:
    if not counter:
        return None
    key, count = max(counter.items(), key=lambda kv: kv[1])
    return key if count >= min_count else None


def memory_to_tags(mem: dict) -> List[dict]:
    """Build dashboard tag chips from aggregated memory."""
    tags: List[dict] = []

    decision = _top_key(mem.get("decision_counts", {}))
    if decision:
        tone = "donate" if decision == "DONATE" else "sell" if decision == "SELL" else "discard"
        tags.append(
            {
                "id": "decision",
                "label": DECISION_LABELS.get(decision, decision),
                "tone": tone,
                "source": "history",
            }
        )

    pickup = _top_key(mem.get("pickup_counts", {}))
    if pickup:
        tags.append(
            {
                "id": "pickup",
                "label": PICKUP_LABELS.get(pickup, pickup),
                "tone": "accent",
                "source": "history",
            }
        )

    cat_counter = mem.get("category_counts", {})
    for cat, _ in Counter(cat_counter).most_common(3):
        label = CATEGORY_LABELS.get(cat, cat.replace("_", " ").title())
        tags.append({"id": f"waste-{cat}", "label": label, "tone": "neutral", "source": "history"})

    total = int(mem.get("total_events", 0))
    if total and not tags:
        tags.append(
            {
                "id": "learning",
                "label": f"Learning from {total} interactions",
                "tone": "neutral",
                "source": "history",
            }
        )

    return tags


async def get_user_preference_memory(user_id: str) -> dict:
    mem = await _load(user_id)
    decision = _top_key(mem.get("decision_counts", {}))
    pickup = _top_key(mem.get("pickup_counts", {}))
    top_categories = [c for c, _ in Counter(mem.get("category_counts", {})).most_common(3)]

    return {
        "tags": memory_to_tags(mem),
        "inferred": {
            "preferredDecision": decision,
            "pickupLocation": pickup,
            "wasteTypes": top_categories,
        },
        "stats": {
            "totalEvents": int(mem.get("total_events", 0)),
            "decisionCounts": mem.get("decision_counts", {}),
            "categoryCounts": mem.get("category_counts", {}),
        },
        "recentEvents": mem.get("recent_events", [])[:5],
        "updatedAt": mem.get("updated_at"),
    }
