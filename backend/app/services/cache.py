from __future__ import annotations

import hashlib
import json
import logging
import re
import struct
from typing import Any, List, Optional, Tuple

import redis.asyncio as aioredis

from app.config import settings
from app.observability import capture_silent_failure

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None
_redis_binary: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    global _redis, _redis_binary
    if not settings.redis_enabled:
        return
    try:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        _redis_binary = aioredis.from_url(
            settings.redis_url,
            decode_responses=False,
        )
        await _redis.ping()
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning("Redis unavailable, caching disabled: %s", exc)
        capture_silent_failure(
            exc, where="redis.init", reason="connect_failed", redis_url=settings.redis_url
        )
        _redis = None
        _redis_binary = None


async def close_redis() -> None:
    global _redis, _redis_binary
    if _redis is not None:
        await _redis.aclose()
        _redis = None
    if _redis_binary is not None:
        await _redis_binary.aclose()
        _redis_binary = None


def get_redis() -> Optional[aioredis.Redis]:
    return _redis


def get_redis_binary() -> Optional[aioredis.Redis]:
    return _redis_binary


# --- Key helpers ---

def ip_cache_key(ip: str) -> str:
    return f"ip_cache:{ip}"


def rule_key(location_id: str, item_id: str) -> str:
    return f"rule:{location_id}:{item_id}"


def item_doc_key(normalized_query: str) -> str:
    digest = hashlib.sha256(normalized_query.encode()).hexdigest()
    return f"item:{digest}"


def geo_meta_key(location_id: str) -> str:
    return f"geo_meta:{location_id}"


def location_rag_key(zip_code: str) -> str:
    """Persistent (no-TTL) RAG knowledge built once at onboarding, keyed by zip."""
    slug = re.sub(r"[^a-z0-9]+", "_", (zip_code or "unknown").lower()).strip("_")
    return f"location_rag:{slug}"


def slugify_geo(city: Optional[str], region: Optional[str]) -> str:
    raw = f"{city or 'unknown'}_{region or 'unknown'}"
    slug = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    return f"geo:{slug}"


def municipal_rules_key(location_id: str) -> str:
    return f"municipal_rules:{location_id}"


def disposal_options_key(url: str, location_hint: Optional[str] = None) -> str:
    raw = f"{url}:{location_hint or ''}"
    return f"disposal_options:{hashlib.sha256(raw.encode()).hexdigest()}"


def normalize_query(text: str) -> str:
    return " ".join(text.lower().split())


def pack_embedding(vector: List[float]) -> bytes:
    return struct.pack(f"{len(vector)}f", *vector)


# --- Generic cache ops ---

async def get_string(key: str) -> Optional[str]:
    if _redis is None:
        return None
    try:
        return await _redis.get(key)
    except Exception as exc:
        logger.warning("Redis get failed for %s: %s", key, exc)
        capture_silent_failure(exc, where="redis.get_string", key=key)
        return None


async def set_string(key: str, value: str, ttl: Optional[int] = None) -> None:
    if _redis is None:
        return
    try:
        if ttl:
            await _redis.setex(key, ttl, value)
        else:
            await _redis.set(key, value)
    except Exception as exc:
        logger.warning("Redis set failed for %s: %s", key, exc)
        capture_silent_failure(exc, where="redis.set_string", key=key)


async def get_json(key: str) -> Optional[Any]:
    if _redis is None:
        return None
    try:
        raw = await _redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis get failed for %s: %s", key, exc)
        capture_silent_failure(exc, where="redis.get_json", key=key)
        return None


async def set_json(key: str, value: Any, ttl: Optional[int] = None) -> None:
    if _redis is None:
        return
    try:
        payload = json.dumps(value)
        if ttl:
            await _redis.setex(key, ttl, payload)
        else:
            await _redis.set(key, payload)
    except Exception as exc:
        logger.warning("Redis set failed for %s: %s", key, exc)
        capture_silent_failure(exc, where="redis.set_json", key=key)


async def delete(key: str) -> None:
    if _redis is None:
        return
    try:
        await _redis.delete(key)
    except Exception as exc:
        logger.warning("Redis delete failed for %s: %s", key, exc)
        capture_silent_failure(exc, where="redis.delete", key=key)
