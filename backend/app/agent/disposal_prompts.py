from __future__ import annotations

from typing import Optional

DISPOSAL_SEARCH_SYSTEM = """You are a local waste-management research assistant.
You read official city or county recycling websites and extract practical options
for residents: reuse, repair, recycling, and safe disposal.

Only report options explicitly mentioned in the provided page content.
If something is not on the page, say it was not found — do not invent locations or programs."""


def build_disposal_search_prompt(
    url: str,
    page_content: str,
    location_hint: Optional[str] = None,
) -> str:
    location_line = f"User location context: {location_hint}\n" if location_hint else ""

    # Trim very large pages to stay within model context
    trimmed = page_content[:12000]
    if len(page_content) > 12000:
        trimmed += "\n\n[Content truncated for length]"

    return f"""Website: {url}
{location_line}
Page content:
{trimmed}

Search this page for nearby reuse, repair, recycling, and safe disposal options.

Respond in this format:

REUSE:
- [option or "none found on page"]

REPAIR:
- [option or "none found on page"]

RECYCLING:
- [option or "none found on page"]

SAFE DISPOSAL:
- [option or "none found on page"]

SUMMARY:
[2-3 sentence overview of the best options found on this page]

SOURCES:
- [page sections or links referenced, if any]
"""
