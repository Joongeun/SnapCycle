"""Fetch a waste/recycling site and extract disposal options with Gemini."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.disposal_agent import search_disposal_options
from app.services.cache import close_redis, init_redis

TEST_URL = "https://berkeleyca.gov/city-services/trash-recycling/waste-sorting-guide"
LOCATION_HINT = "Berkeley, CA"


async def main() -> None:
    await init_redis()
    try:
        print(f"Fetching and analyzing: {TEST_URL}\n")

        result = await search_disposal_options(TEST_URL, location_hint=LOCATION_HINT)

        print(f"HTTP status:     {result['status_code']}")
        print(f"Content length:  {result['content_length']} chars")
        print(f"Location hint:   {result['location_hint']}")
        print(f"Cached:          {result.get('cached', False)}")
        print("\n--- Disposal options found ---\n")
        print(result["options"])
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
