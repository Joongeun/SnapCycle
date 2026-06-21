from fastapi import APIRouter, HTTPException, Request

from app.agent.schemas import LocationDetectResponse
from app.config import settings
from app.services.cache import get_json, municipal_rules_key, set_json
from app.services.geoip import _load_location, resolve_location
from app.services.location import get_location_data, list_locations

router = APIRouter()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


@router.get("/")
async def get_locations():
    locations = []
    for loc_id in list_locations():
        loc = get_location_data(loc_id)
        if loc:
            locations.append({"id": loc_id, "name": loc["name"], "jurisdiction": loc.get("jurisdiction")})
    return {"locations": locations}


@router.get("/detect", response_model=LocationDetectResponse)
async def detect_location(request: Request):
    """Detect user's location from IP (known or dynamic city)."""
    ip = _get_client_ip(request)
    try:
        location_id, location, geo = await resolve_location(ip)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return LocationDetectResponse(
        location_id=location_id,
        location_name=location["name"],
        detected_city=geo.get("city"),
        detected_region=geo.get("region"),
        detected_zip=geo.get("zip"),
        ip=ip,
        ip_cache_hit=geo.get("ip_cache_hit", False),
        dynamic=geo.get("dynamic", False),
    )


@router.get("/{location_id}")
async def get_location(location_id: str):
    cache_key = municipal_rules_key(location_id)
    cached = await get_json(cache_key)
    if cached:
        return {**cached, "cached": True}

    data = get_location_data(location_id)
    if data is None:
        data = await _load_location(location_id)

    if data is None:
        raise HTTPException(status_code=404, detail="Location not found")

    payload = {**data, "cached": False}
    if not data.get("dynamic"):
        await set_json(cache_key, data, settings.cache_ttl_municipal_rules)
    return payload
