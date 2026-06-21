"""Test the full cache-aside workflow: IP → item vector → rule cache."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.schemas import RecycleRequest
from app.agent.orchestrator import get_recycling_instructions
from app.services.cache import close_redis, init_redis
from app.services.item_index import init_item_index

TEST_IP = "219.87.64.1"
TEST_ITEM = "weird shiny wrapper"


async def run_once(label: str) -> None:
    req = RecycleRequest(item=TEST_ITEM)
    result = await get_recycling_instructions(req, TEST_IP)
    print(f"\n=== {label} ===")
    print(f"location:   {result.location_id} ({result.location_name})")
    print(f"item_id:    {result.item_id}")
    print(f"category:   {result.category}")
    print(f"accepted:   {result.accepted}")
    print(f"instructions: {result.instructions[:120]}...")
    print(f"cache:      ip={result.cache.ip_cache_hit} item={result.cache.item_vector_hit} rule={result.cache.rule_cache_hit}")
    print(f"cached:     {result.cached}")


async def main() -> None:
    await init_redis()
    await init_item_index()
    try:
        print(f"Testing cache-aside with IP={TEST_IP} item={TEST_ITEM!r}")
        await run_once("Run 1 (expect all misses)")
        await run_once("Run 2 (expect ip + item + rule hits)")
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
