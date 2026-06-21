from __future__ import annotations

import re
from typing import List, Optional

from browserbase import Browserbase

from app.config import settings

_client: Optional[Browserbase] = None


def get_client() -> Browserbase:
    global _client
    if _client is None:
        if not settings.browserbase_api_key:
            raise ValueError("BROWSERBASE_API_KEY is not set")
        _client = Browserbase(api_key=settings.browserbase_api_key)
    return _client


def search_web(query: str, *, num_results: int = 3) -> List[dict]:
    """Browserbase web search — returns list of {title, url}."""
    client = get_client()
    response = client.search.web(query=query, num_results=num_results)
    return [
        {"title": r.title, "url": r.url}
        for r in (response.results or [])
    ]


def fetch_page(
    url: str,
    *,
    allow_redirects: bool = True,
    format: str = "markdown",
) -> dict:
    """Lightweight page retrieval via Browserbase Fetch API."""
    client = get_client()
    response = client.fetch_api.create(
        url=url,
        allow_redirects=allow_redirects,
        format=format,
    )
    return {
        "url": url,
        "status_code": response.status_code,
        "content": response.content or "",
        "headers": dict(response.headers) if response.headers else {},
    }


def create_session():
    """Create a full Browserbase session for JS-heavy pages or PDFs."""
    client = get_client()
    kwargs = {}
    if settings.browserbase_project_id:
        kwargs["project_id"] = settings.browserbase_project_id
    return client.sessions.create(**kwargs)


def session_connect_url(session) -> Optional[str]:
    """CDP endpoint Playwright connects to (connect_over_cdp)."""
    return getattr(session, "connect_url", None) or getattr(session, "connectUrl", None)


def session_live_view_url(session_id: str) -> Optional[str]:
    """Embeddable fullscreen live-view URL for the running session."""
    client = get_client()
    try:
        debug = client.sessions.debug(session_id)
    except Exception:  # noqa: BLE001
        return None
    return (
        getattr(debug, "debugger_fullscreen_url", None)
        or getattr(debug, "debuggerFullscreenUrl", None)
        or getattr(debug, "debugger_url", None)
    )
