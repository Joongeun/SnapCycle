"""
Agent S form-filling over a Browserbase cloud browser.

Flow:
  1. Create a Browserbase session and grab its CDP connect URL + live-view URL.
  2. Return the live-view URL immediately so the phone embeds it in a WebView and
     the user watches the browser in real time.
  3. In the background, the form agent (Gemini 2.5 Flash) connects Playwright to
     that same remote session over CDP, reads the form fields, decides values from
     the user's profile, and fills them in — STOPPING before the final submit so
     the user reviews and submits themselves in the WebView.

The agent is intentionally conservative: it only fills inputs, never clicks submit.
If Browserbase/Playwright are unavailable, status flips to "error" and the frontend
falls back to opening the form URL directly in the same WebView.

This is the "Agent S" hook: when the Simular `gui-agents` package and a desktop
runtime are available it can drive the live view instead; the Gemini+Playwright
loop below is the reliable cloud-only driver that shares the exact same contract.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import Dict, List, Optional

from urllib.parse import quote_plus

from app.config import settings
from app.schemas.rrr import AgentFormRequest, AgentFormSession, YelpOutreachRequest
from app.services.browserbase import (
    create_session,
    session_connect_url,
    session_live_view_url,
)

logger = logging.getLogger(__name__)

# In-memory session store (single-process; fine for the hackathon/demo).
_sessions: Dict[str, AgentFormSession] = {}

FILL_SYSTEM = """You are Agent S, a careful web-form-filling agent for the RRR app.
You are given the fields of a disposal/pickup scheduling form and the user's profile.
Decide the best value for each field from the profile and the item being disposed.
Never guess sensitive data you don't have. Leave a field blank (empty string) if you
are unsure. You NEVER submit the form — a human reviews and submits."""


def get_form_status(session_id: str) -> Optional[AgentFormSession]:
    return _sessions.get(session_id)


async def start_form_fill(req: AgentFormRequest) -> AgentFormSession:
    session_id = uuid.uuid4().hex

    if not settings.agent_s_enabled or not settings.browserbase_api_key:
        state = AgentFormSession(
            sessionId=session_id,
            liveViewUrl="",
            status="error",
            detail="Agent S/Browserbase not configured — open the form manually.",
        )
        _sessions[session_id] = state
        return state

    try:
        bb_session = await asyncio.to_thread(create_session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Browserbase session create failed: %s", exc)
        state = AgentFormSession(
            sessionId=session_id, liveViewUrl="", status="error", detail=str(exc)
        )
        _sessions[session_id] = state
        return state

    bb_id = getattr(bb_session, "id", None)
    connect_url = session_connect_url(bb_session)
    live_url = await asyncio.to_thread(session_live_view_url, bb_id) if bb_id else None

    state = AgentFormSession(
        sessionId=session_id,
        liveViewUrl=live_url or "",
        status="filling",
        detail="Agent S is opening the form…",
    )
    _sessions[session_id] = state

    # Kick off the fill in the background; the live view streams immediately.
    asyncio.create_task(_run_fill(session_id, connect_url, req))
    return state


async def _run_fill(session_id: str, connect_url: Optional[str], req: AgentFormRequest) -> None:
    if not connect_url:
        _update(session_id, "error", "No CDP endpoint for the browser session.")
        return
    try:
        await asyncio.to_thread(_fill_sync, session_id, connect_url, req)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Agent S fill failed for %s: %s", session_id, exc)
        _update(session_id, "error", f"Could not auto-fill: {exc}")


def _update(session_id: str, status: str, detail: str) -> None:
    state = _sessions.get(session_id)
    if state:
        state.status = status  # type: ignore[assignment]
        state.detail = detail


def _fill_sync(session_id: str, connect_url: str, req: AgentFormRequest) -> None:
    """Synchronous Playwright + Gemini fill loop (runs in a worker thread)."""
    from playwright.sync_api import sync_playwright  # local import: optional dep

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(connect_url)
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()

        page.goto(req.formUrl, wait_until="domcontentloaded", timeout=45000)
        _update(session_id, "filling", "Reading the form fields…")

        fields = _scrape_fields(page)
        if not fields:
            _update(session_id, "ready", "Form loaded — review and submit.")
            return

        values = _decide_values_blocking(fields, req)
        _update(session_id, "filling", "Filling in your details…")

        for field in fields:
            value = values.get(field["selector"])
            if not value:
                continue
            try:
                el = page.query_selector(field["selector"])
                if not el:
                    continue
                if field["kind"] == "select":
                    el.select_option(label=value)
                else:
                    el.fill(value)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Field fill skipped (%s): %s", field["selector"], exc)

        _update(session_id, "ready", "Prefilled — review the fields and submit.")
        # Leave the page open in the live view for the user; do NOT submit.


def _scrape_fields(page) -> List[dict]:
    """Extract a compact description of fillable fields with stable selectors."""
    handles = page.query_selector_all("input, textarea, select")
    fields: List[dict] = []
    for i, el in enumerate(handles):
        try:
            tag = (el.evaluate("e => e.tagName") or "").lower()
            input_type = (el.get_attribute("type") or "text").lower()
            if input_type in ("hidden", "submit", "button", "image", "file", "password"):
                continue
            name = el.get_attribute("name") or ""
            el_id = el.get_attribute("id") or ""
            placeholder = el.get_attribute("placeholder") or ""
            aria = el.get_attribute("aria-label") or ""
            # Build a stable selector.
            if el_id:
                selector = f"#{_css_escape(el_id)}"
            elif name:
                selector = f'{tag}[name="{name}"]'
            else:
                el.evaluate(f"e => e.setAttribute('data-rrr-idx', '{i}')")
                selector = f'[data-rrr-idx="{i}"]'
            fields.append(
                {
                    "selector": selector,
                    "kind": "select" if tag == "select" else "input",
                    "label": (aria or placeholder or name or el_id)[:80],
                    "type": input_type,
                }
            )
        except Exception:  # noqa: BLE001
            continue
        if len(fields) >= 40:
            break
    return fields


def _css_escape(value: str) -> str:
    return re.sub(r'([^a-zA-Z0-9_-])', r"\\\1", value)


# --------------------------------------------------------------------------- #
# Yelp hauler outreach: open Yelp, let the user sign in, message the top haulers
# --------------------------------------------------------------------------- #

def _default_message(req: YelpOutreachRequest) -> str:
    item = req.itemName or "an item"
    desc = f" ({req.itemDescription})" if req.itemDescription else ""
    return (
        f"Hi! I'd like a quote to haul away {item}{desc} from {req.location}. "
        "What's your availability and pricing? Thanks!"
    )


async def start_yelp_outreach(req: YelpOutreachRequest) -> AgentFormSession:
    """Create a live Browserbase session pointed at Yelp; message haulers in the bg."""
    session_id = uuid.uuid4().hex

    if not settings.agent_s_enabled or not settings.browserbase_api_key:
        state = AgentFormSession(
            sessionId=session_id,
            liveViewUrl="",
            status="error",
            detail="Agent S/Browserbase not configured — open Yelp manually.",
        )
        _sessions[session_id] = state
        return state

    try:
        bb_session = await asyncio.to_thread(create_session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Browserbase session create failed: %s", exc)
        state = AgentFormSession(sessionId=session_id, liveViewUrl="", status="error", detail=str(exc))
        _sessions[session_id] = state
        return state

    bb_id = getattr(bb_session, "id", None)
    connect_url = session_connect_url(bb_session)
    live_url = await asyncio.to_thread(session_live_view_url, bb_id) if bb_id else None

    state = AgentFormSession(
        sessionId=session_id,
        liveViewUrl=live_url or "",
        status="filling",
        detail="Opening Yelp — sign in to your account in this view to message haulers.",
    )
    _sessions[session_id] = state

    asyncio.create_task(_run_yelp(session_id, connect_url, req))
    return state


async def _run_yelp(session_id: str, connect_url: Optional[str], req: YelpOutreachRequest) -> None:
    if not connect_url:
        _update(session_id, "error", "No CDP endpoint for the browser session.")
        return
    try:
        await asyncio.to_thread(_yelp_outreach_sync, session_id, connect_url, req)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Yelp outreach failed for %s: %s", session_id, exc)
        _update(session_id, "error", f"Could not message haulers: {exc}")


def _yelp_outreach_sync(session_id: str, connect_url: str, req: YelpOutreachRequest) -> None:
    """Best-effort Yelp navigation + message drafting. DOM selectors are resilient
    but Yelp changes often — this stops before sending so the signed-in user reviews
    and sends each message themselves in the live view."""
    from playwright.sync_api import sync_playwright

    message = req.message.strip() or _default_message(req)

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(connect_url)
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()

        search_url = (
            f"https://www.yelp.com/search?find_desc=junk+removal&find_loc={quote_plus(req.location)}"
        )
        page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
        _update(session_id, "filling", "Opened Yelp. Sign in to your account in this view…")

        if not _wait_for_yelp_login(page, timeout_s=120):
            _update(
                session_id,
                "ready",
                "Sign in to Yelp in this view, then reopen to message the haulers.",
            )
            return

        _update(session_id, "filling", "Signed in. Finding the top junk haulers…")
        links = _top_business_links(page, limit=max(1, req.maxHaulers))
        if not links:
            _update(session_id, "ready", "Couldn't read the hauler list — browse Yelp here directly.")
            return

        drafted = 0
        for url in links:
            try:
                if _message_business(context, url, message):
                    drafted += 1
                    _update(
                        session_id, "filling", f"Drafted a message to hauler {drafted} of {len(links)}…"
                    )
            except Exception as exc:  # noqa: BLE001
                logger.debug("Yelp message draft skipped (%s): %s", url, exc)

        if drafted:
            _update(
                session_id,
                "ready",
                f"Drafted messages to {drafted} hauler(s). Review each and tap Send in the view.",
            )
        else:
            _update(
                session_id,
                "ready",
                "Opened the top haulers — use 'Request a Quote' in the view to message them.",
            )


def _wait_for_yelp_login(page, *, timeout_s: int = 120) -> bool:
    """Poll for a signed-in indicator (user menu / no visible Log In button)."""
    import time

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            # Yelp shows a user-avatar menu when signed in; the "Log In" link disappears.
            logged_out = page.query_selector("a[href*='login'], a:has-text('Log In')")
            avatar = page.query_selector(
                "[data-testid='user-menu'], button[aria-label*='profile' i], img[alt*='avatar' i]"
            )
            if avatar and not logged_out:
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    return False


def _top_business_links(page, *, limit: int = 3) -> List[str]:
    """Collect the top organic business URLs from a Yelp search results page."""
    urls: List[str] = []
    try:
        handles = page.query_selector_all("a[href*='/biz/']")
        for el in handles:
            href = el.get_attribute("href") or ""
            if "/biz/" not in href:
                continue
            full = href if href.startswith("http") else f"https://www.yelp.com{href}"
            full = full.split("?")[0]
            if full not in urls:
                urls.append(full)
            if len(urls) >= limit:
                break
    except Exception:  # noqa: BLE001
        pass
    return urls


def _message_business(context, biz_url: str, message: str) -> bool:
    """Open a business page and pre-fill its 'Request a Quote'/message box. Never sends."""
    page = context.new_page()
    try:
        page.goto(biz_url, wait_until="domcontentloaded", timeout=45000)
        # Try to open the quote/message flow.
        for sel in (
            "a:has-text('Request a Quote')",
            "button:has-text('Request a Quote')",
            "a:has-text('Request pricing')",
            "button:has-text('Message')",
            "a:has-text('Message the')",
        ):
            try:
                btn = page.query_selector(sel)
                if btn:
                    btn.click()
                    page.wait_for_timeout(1500)
                    break
            except Exception:  # noqa: BLE001
                continue
        # Fill the first visible message textarea.
        box = page.query_selector("textarea")
        if box:
            box.fill(message)
            return True
        return False
    finally:
        # Leave the page open in the session so the signed-in user can review + send.
        pass


def _decide_values_blocking(fields: List[dict], req: AgentFormRequest) -> Dict[str, str]:
    """Ask Gemini (sync) to map profile → field values."""
    from app.services.gemini import generate_sync

    profile = req.profile.model_dump()
    field_lines = "\n".join(
        f'- selector "{f["selector"]}": label="{f["label"]}", type={f["type"]}, kind={f["kind"]}'
        for f in fields
    )
    prompt = f"""User profile: {json.dumps(profile)}
Item being disposed: {req.itemName} — {req.itemDescription}

Form fields:
{field_lines}

For each field, choose a value from the profile/item, or "" if unknown or sensitive.
Return ONLY valid JSON mapping selector -> value, e.g.:
{{ "#name": "Jane Doe", "input[name=\\"zip\\"]": "94704" }}"""

    raw = generate_sync(FILL_SYSTEM, prompt, max_output_tokens=1024)
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return {str(k): str(v) for k, v in data.items() if v}
