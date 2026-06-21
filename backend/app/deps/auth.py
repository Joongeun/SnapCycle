from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


async def require_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> str:
    """Verify Supabase JWT when auth is enabled; otherwise allow anonymous dev access."""
    if not settings.auth_required:
        if credentials and credentials.credentials:
            user_id = await _verify_supabase_token(credentials.credentials)
            if user_id:
                return user_id
        return "anonymous"

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    user_id = await _verify_supabase_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id


async def _verify_supabase_token(token: str) -> Optional[str]:
    if not settings.supabase_url or not settings.supabase_anon_key:
        logger.warning("Supabase not configured — skipping JWT verification")
        return None

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
        if response.status_code != 200:
            return None
        return response.json().get("id")
    except Exception as exc:
        logger.warning("Supabase auth check failed: %s", exc)
        return None
