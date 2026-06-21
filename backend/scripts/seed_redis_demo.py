"""
Populate Redis with vector-indexed items and cache-aside keys for Redis Insight demos.

Run from repo root:
  .venv/bin/python scripts/seed_redis_demo.py

Requires: Redis Stack (recycle-redis), GOOGLE_API_KEY in app/.env
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.services.cache import (
    close_redis,
    disposal_options_key,
    geo_meta_key,
    get_json,
    init_redis,
    ip_cache_key,
    municipal_rules_key,
    rule_key,
    set_json,
    set_string,
    slugify_geo,
)
from app.services.item_index import init_item_index, search_item
from app.services.item_index import index_item_query

# Canonical item labels → stable item_id (simulates classify_item output)
ITEM_CATALOG: list[tuple[str, str]] = [
    ("old leather couch", "furniture-couch"),
    ("broken microwave oven", "appliance-microwave"),
    ("flat screen tv", "electronics-tv"),
    ("queen size mattress", "furniture-mattress"),
    ("plastic lawn chair", "furniture-chair"),
    ("glass wine bottles", "glass-bottle"),
    ("aluminum soda can", "aluminum-can"),
    ("cardboard moving boxes", "cardboard-box"),
    ("used bicycle", "sports-bicycle"),
    ("winter coat", "clothing-coat"),
    ("shiny candy wrapper", "shiny_wrapper"),
    ("plastic film bag", "plastic_film_wrapper"),
    ("styrofoam packing peanuts", "styrofoam"),
    ("lithium laptop battery", "battery-lithium"),
    ("paint cans half full", "hhw-paint"),
]

# Similar phrasings — should hit vector index after seeding
SIMILARITY_QUERIES: list[tuple[str, str]] = [
    ("leather sofa", "furniture-couch"),
    ("couch", "furniture-couch"),
    ("microwave that doesn't heat", "appliance-microwave"),
    ("LCD television", "electronics-tv"),
    ("king mattress", "furniture-mattress"),
    ("patio chair", "furniture-chair"),
    ("empty wine bottle", "glass-bottle"),
    ("soda can", "aluminum-can"),
    ("cardboard box", "cardboard-box"),
    ("bike", "sports-bicycle"),
    ("coat jacket", "clothing-coat"),
    ("shiny wrapper", "shiny_wrapper"),
    ("plastic bag", "plastic_film_wrapper"),
    ("packing peanuts", "styrofoam"),
    ("laptop battery", "battery-lithium"),
    ("old paint", "hhw-paint"),
]

LOCATIONS = [
    ("berkeley", "Berkeley", "CA", "94704"),
    ("ann_arbor", "Ann Arbor", "MI", "48104"),
    ("austin", "Austin", "TX", "78701"),
]


def _services_key(decision: str, location: str, category: str, condition: str, item: str) -> str:
    raw = f"{decision}:{location.lower()}:{category}:{condition}:{item.lower()}"
    return f"services:{hashlib.sha256(raw.encode()).hexdigest()}"


async def seed_vectors() -> tuple[int, int]:
    print("\n=== Vector index (item_idx) ===")
    for label, item_id in ITEM_CATALOG:
        await index_item_query(label, item_id)
        print(f"  indexed: {label!r} → {item_id}")

    hits = 0
    misses = 0
    print("\n--- Similarity search probes ---")
    for query, expected_id in SIMILARITY_QUERIES:
        match = await search_item(query)
        if match and match.item_id == expected_id:
            hits += 1
            print(f"  HIT  {query!r} → {match.item_id} (dist={match.distance:.3f})")
        elif match:
            misses += 1
            print(f"  MISS {query!r} → got {match.item_id}, wanted {expected_id} (dist={match.distance:.3f})")
        else:
            misses += 1
            print(f"  MISS {query!r} → no match")
    return hits, misses


async def seed_caches() -> int:
    print("\n=== Cache-aside keys ===")
    count = 0

    for loc_id, city, region, zip_code in LOCATIONS:
        ip = f"10.0.{hash(loc_id) % 200}.{hash(zip_code) % 200}"
        await set_string(ip_cache_key(ip), loc_id, ttl=settings.cache_ttl_ip)
        await set_json(
            geo_meta_key(loc_id),
            {"city": city, "region": region, "zip": zip_code, "name": f"{city}, {region}"},
            ttl=settings.cache_ttl_ip,
        )
        count += 2
        print(f"  ip_cache + geo_meta: {ip} → {loc_id}")

        rules_payload = {
            "location_id": loc_id,
            "city": city,
            "rules_summary": f"Curbside recycling rules for {city}",
            "bins": ["recycling", "compost", "landfill"],
        }
        await set_json(municipal_rules_key(loc_id), rules_payload, ttl=settings.cache_ttl_municipal_rules)
        count += 1

        for _, item_id in ITEM_CATALOG[:5]:
            await set_json(
                rule_key(loc_id, item_id),
                {
                    "item_id": item_id,
                    "accepted": item_id.startswith(("glass", "aluminum", "cardboard")),
                    "instructions": f"How to dispose of {item_id} in {city}",
                    "category": "recyclable" if "glass" in item_id else "general",
                },
                ttl=None,
            )
            count += 1

    service_samples = [
        ("DONATE", "Berkeley, CA", "furniture", "good", "couch", "East Bay Habitat ReStore"),
        ("SELL", "Berkeley, CA", "electronics", "fair", "flat screen tv", "Facebook Marketplace"),
        ("DISCARD", "Ann Arbor, MI", "furniture", "poor", "mattress", "City bulky pickup"),
        ("DONATE", "Austin, TX", "clothing", "excellent", "winter coat", "Goodwill Austin"),
    ]
    for decision, location, category, condition, item, service_name in service_samples:
        key = _services_key(decision, location, category, condition, item)
        await set_json(
            key,
            [
                {
                    "name": service_name,
                    "description": f"Local {decision.lower()} option for {item} in {location}",
                    "url": "https://example.org/demo",
                    "phone": "555-0100",
                }
            ],
            ttl=settings.cache_ttl_disposal_options,
        )
        count += 1
        print(f"  services: {decision} {item} @ {location}")

    url = "https://berkeleyrecycling.org/bulky"
    await set_json(
        disposal_options_key(url, "Berkeley, CA"),
        {"options": ["curbside bulky", "drop-off center"], "source": url},
        ttl=settings.cache_ttl_disposal_options,
    )
    count += 1

    return count


async def print_redis_summary() -> None:
    from app.services.cache import get_redis

    redis = get_redis()
    if redis is None:
        print("\nRedis not connected.")
        return

    keys = await redis.keys("*")
    item_keys = [k for k in keys if k.startswith("item:")]
    service_keys = [k for k in keys if k.startswith("services:")]
    rule_keys = [k for k in keys if k.startswith("rule:")]

    print("\n=== Redis summary (for Redis Insight) ===")
    print(f"  Total keys:     {len(keys)}")
    print(f"  item:* (vector): {len(item_keys)}")
    print(f"  services:*:     {len(service_keys)}")
    print(f"  rule:*:         {len(rule_keys)}")
    print(f"  ip_cache:*:     {len([k for k in keys if k.startswith('ip_cache:')])}")
    print(f"  geo_meta:*:     {len([k for k in keys if k.startswith('geo_meta:')])}")
    print(f"  municipal_rules:* {len([k for k in keys if k.startswith('municipal_rules:')])}")

    sample = await get_json(service_keys[0]) if service_keys else None
    if sample:
        print(f"\n  Sample services key: {service_keys[0]}")
        print(f"  {json.dumps(sample, indent=2)[:300]}...")

    print("\n  Redis Insight: connect to 127.0.0.1:6379")
    print("  CLI checks:")
    print("    docker exec recycle-redis redis-cli FT.INFO item_idx")
    print("    docker exec recycle-redis redis-cli KEYS 'item:*'")


async def main() -> None:
    await init_redis()
    await init_item_index()
    try:
        print("Seeding Redis demo data...")
        print(f"  REDIS_URL={settings.redis_url}")
        print(f"  EMBEDDING_DIM={settings.embedding_dim}")
        print(f"  VECTOR_DISTANCE_THRESHOLD={settings.vector_distance_threshold}")

        hits, misses = await seed_vectors()
        cache_count = await seed_caches()
        await print_redis_summary()

        print(f"\nDone. Vector probes: {hits} hits, {misses} misses. Cache keys written: ~{cache_count}")
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
