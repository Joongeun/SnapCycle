from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import httpx

from app.config import settings
from app.observability import capture_silent_failure
from app.services.cache import geo_meta_key, get_json, get_string, ip_cache_key, set_json, set_string, slugify_geo
from app.services.location import get_location_data, list_locations

# City/region aliases → location_id for known locations
CITY_ALIASES: Dict[str, str] = {
    "berkeley": "berkeley",
    "oakland": "berkeley",
    "emeryville": "berkeley",
    "palo alto": "stanford",
    "stanford": "stanford",
    "menlo park": "stanford",
    "mountain view": "stanford",
    "los angeles": "ucla",
    "westwood": "ucla",
    "santa monica": "ucla",
    "ann arbor": "ann_arbor",
    "ypsilanti": "ann_arbor",
}


async def lookup_ip(ip: str) -> dict:
    """Resolve IP to city/region/zip via ip-api.com."""
    if ip in ("127.0.0.1", "::1", "localhost"):
        return {"city": None, "region": None, "zip": None, "lat": None, "lon": None}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.geoip_url}/{ip}",
                params={"fields": "status,city,regionName,zip,lat,lon"},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
    except Exception as exc:  # noqa: BLE001
        # Network/timeout/HTTP error talking to ip-api. Re-raise so the caller's
        # behavior is unchanged, but record it — otherwise a flaky geoip provider
        # is invisible behind the location-resolution flow.
        capture_silent_failure(exc, where="geoip.lookup_ip", ip=ip, reason="request_error")
        raise

    if data.get("status") != "success":
        # ip-api answered but couldn't resolve the IP (rate-limited, reserved range).
        # We silently fall back to "no location"; surface it so the degradation is seen.
        capture_silent_failure(
            RuntimeError(f"ip-api returned status={data.get('status')!r} for IP"),
            where="geoip.lookup_ip",
            ip=ip,
            reason="unresolved",
            api_status=data.get("status"),
        )
        return {"city": None, "region": None, "zip": None, "lat": None, "lon": None}

    return {
        "city": data.get("city"),
        "region": data.get("regionName"),
        "zip": data.get("zip"),
        "lat": data.get("lat"),
        "lon": data.get("lon"),
    }


def match_location_from_geo(geo: dict) -> Optional[str]:
    """Map geo lookup to a known location_id, or None for unknown cities."""
    city = (geo.get("city") or "").lower()

    for alias, location_id in CITY_ALIASES.items():
        if alias in city:
            return location_id

    lat, lon = geo.get("lat"), geo.get("lon")
    if lat is not None and lon is not None:
        closest, dist_km = _closest_location_by_coords(lat, lon)
        if closest and dist_km <= settings.geo_max_match_km:
            return closest

    return None


def build_dynamic_location(geo: dict) -> dict:
    """Build a location record for an unknown city from GeoIP data."""
    city = geo.get("city") or "Unknown"
    region = geo.get("region") or ""
    location_id = slugify_geo(geo.get("city"), geo.get("region"))

    name = f"{city}, {region}".strip().strip(",")
    return {
        "id": location_id,
        "name": name,
        "jurisdiction": region or city,
        "city": city,
        "region": region,
        "zip": geo.get("zip"),
        "dynamic": True,
        "documents": [],
    }


async def resolve_location(
    ip: str,
    override_id: Optional[str] = None,
) -> Tuple[str, dict, dict]:
    """
    Cache-aside location resolution.
    Known cities → local JSON. Unknown cities → dynamic geo-based location.
    """
    if override_id:
        location = get_location_data(override_id)
        if location is None:
            raise ValueError(f"Unknown location: {override_id}")
        return override_id, location, {
            "city": None,
            "region": None,
            "zip": None,
            "ip": ip,
            "ip_cache_hit": False,
            "location_override": True,
            "dynamic": False,
        }

    cache_key = ip_cache_key(ip)
    cached_location_id = await get_string(cache_key)
    if cached_location_id:
        location = await _load_location(cached_location_id)
        if location is not None:
            geo_meta = await get_json(geo_meta_key(cached_location_id)) or {}
            return cached_location_id, location, {
                "city": geo_meta.get("city"),
                "region": geo_meta.get("region"),
                "zip": geo_meta.get("zip"),
                "ip": ip,
                "ip_cache_hit": True,
                "dynamic": location.get("dynamic", False),
            }

    geo = await lookup_ip(ip)
    known_id = match_location_from_geo(geo)

    if known_id:
        location = get_location_data(known_id)
        if location is None:
            raise ValueError(f"Unknown location: {known_id}")
        location_id = known_id
        dynamic = False
    else:
        location = build_dynamic_location(geo)
        location_id = location["id"]
        dynamic = True
        await set_json(geo_meta_key(location_id), {
            "city": geo.get("city"),
            "region": geo.get("region"),
            "zip": geo.get("zip"),
            "name": location["name"],
        }, ttl=None)

    await set_string(cache_key, location_id, ttl=settings.cache_ttl_ip)

    geo["ip"] = ip
    geo["ip_cache_hit"] = False
    geo["dynamic"] = dynamic
    return location_id, location, geo


async def _load_location(location_id: str) -> Optional[dict]:
    """Load from local JSON or Redis geo_meta for dynamic locations."""
    local = get_location_data(location_id)
    if local is not None:
        return local

    if location_id.startswith("geo:"):
        meta = await get_json(geo_meta_key(location_id))
        if meta:
            return {
                "id": location_id,
                "name": meta.get("name", location_id),
                "jurisdiction": meta.get("region") or meta.get("city", ""),
                "city": meta.get("city"),
                "region": meta.get("region"),
                "dynamic": True,
                "documents": [],
            }
    return None


def _closest_location_by_coords(lat: float, lon: float) -> Tuple[Optional[str], float]:
    best_id: Optional[str] = None
    best_dist = float("inf")

    for loc_id in list_locations():
        loc = get_location_data(loc_id)
        if not loc or "coordinates" not in loc:
            continue
        coords = loc["coordinates"]
        dist = _haversine(lat, lon, coords["lat"], coords["lng"])
        if dist < best_dist:
            best_dist = dist
            best_id = loc_id

    return best_id, best_dist


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return r * 2 * math.asin(math.sqrt(a))
