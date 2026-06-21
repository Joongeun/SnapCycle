"""
Sentry silent-failure verification harness.

Initializes the Sentry SDK with a `before_send` recorder (so events are fully
built + serialized exactly as they would be transmitted to a real DSN, but
nothing leaves the machine), then deliberately drives every graceful-degradation
path that calls `capture_silent_failure(...)`. Each recorded event proves the
capture fired and gives the exact Sentry issue title + tags + context.

Run:  .venv/Scripts/python.exe evals/sentry_probe.py
Writes: evals/run_artifacts/sentry_events.json
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import sentry_sdk

RECORDED: list[dict] = []


def _before_send(event, hint):
    exc = (event.get("exception") or {}).get("values") or [{}]
    title_type = exc[-1].get("type")
    title_value = exc[-1].get("value")
    RECORDED.append(
        {
            "issue_title": f"{title_type}: {title_value}" if title_type else event.get("message"),
            "type": title_type,
            "value": title_value,
            "tags": event.get("tags") or {},
            "context": (event.get("contexts") or {}).get("silent_failure"),
            "level": event.get("level"),
        }
    )
    return None  # do not transmit; we only need proof the event was built


# Fake but well-formed DSN so the SDK builds a real client + transport pipeline.
# Built from parts so the public-key@host literal isn't rewritten by tooling.
_PUBKEY = "0" * 32
_HOST = "o0.ingest.sentry.io"
_FAKE_DSN = "https://" + _PUBKEY + "@" + _HOST + "/1"
sentry_sdk.init(
    dsn=_FAKE_DSN,
    environment="probe",
    traces_sample_rate=1.0,
    default_integrations=False,
    before_send=_before_send,
)


async def main():
    from app.config import settings
    from app.schemas.rrr import HaulersRequest
    import app.services.cache as cache
    import app.services.browserbase_research as bbr
    import app.services.geoip as geoip
    from app.services.rrr_haulers import find_haulers
    from app.services.rrr_service_discovery import _parse_services
    from app.services.rrr_disposal import _parse_cards
    from app.services.rrr_identify import _parse_identify_response
    from app.services.rrr_schedule import _parse_json
    import redis.asyncio as aioredis

    # 1) Yelp fallback to [] — YELP_API_KEY absent
    settings.yelp_api_key = ""
    await find_haulers(HaulersRequest(location="Berkeley, CA", itemName="old couch"))

    # 2-5) Gemini structured-output JSON parse failures (4 endpoints)
    _parse_services('{ "services": [ {name: broken json } ] }')
    _parse_cards('{ "cards": [ {method: donation, } }')
    _parse_identify_response('{ "itemName": "sofa" "category": }')
    _parse_json('{ confirmation: not-valid }')

    # 6) Redis cache error — point the client at a dead port, then read/write
    dead = aioredis.from_url("redis://localhost:6399/0", encoding="utf-8", decode_responses=True)
    cache._redis = dead
    await cache.get_json("rule:berkeley:battery")   # redis.get_json
    await cache.set_json("rule:berkeley:battery", {"x": 1})  # redis.set_json
    cache._redis = None

    # 7) Redis connection failure at init
    orig_url = settings.redis_url
    settings.redis_url = "redis://localhost:6399/0"
    await cache.init_redis()  # redis.init connect_failed
    settings.redis_url = orig_url

    # 8) Browserbase fetch miss inside live web research
    async def _stub_generate(system, user, **kw):
        return "CATEGORY: unknown\nINSTRUCTIONS: n/a"

    bbr.search_web = lambda q, num_results=3: [{"url": "https://unreachable.invalid/x", "title": "t"}]

    def _raise_fetch(url, **kw):
        raise ConnectionError(f"Browserbase fetch failed for {url}")

    bbr.fetch_page = _raise_fetch
    bbr.generate = _stub_generate
    await bbr.research_recycling_rule(city="Berkeley", region="CA", item="couch", item_id="furniture")

    # 9) GeoIP ip-api unresolved (status != success) for a reserved IP
    try:
        await geoip.lookup_ip("0.0.0.0")  # ip-api answers status=fail -> capture 'unresolved'
    except Exception:
        pass

    # 10) GeoIP request error — dead provider host
    settings.geoip_url = "http://127.0.0.1:9/json"  # nothing listening -> connect error
    try:
        await geoip.lookup_ip("8.8.8.8")  # capture 'request_error' then re-raise
    except Exception:
        pass

    sentry_sdk.flush()


if __name__ == "__main__":
    asyncio.run(main())
    out = Path(__file__).parent / "run_artifacts" / "sentry_events.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(RECORDED, indent=2))
    print(f"\nRecorded {len(RECORDED)} Sentry events -> {out}\n")
    for e in RECORDED:
        where = (e["tags"] or {}).get("failure.where")
        print(f"  [{where}]  {e['issue_title']}")
