from __future__ import annotations

import json
import re

from app.schemas.rrr import ScheduleRequest, ScheduleResponse
from app.services.gemini import generate

SCHEDULE_SYSTEM = """You help users plan their next step after choosing a donate/sell/discard service.
Write concise, friendly copy for a mobile app confirmation screen."""


async def draft_schedule(req: ScheduleRequest) -> ScheduleResponse:
    prompt = f"""The user chose "{req.serviceName}" to {req.decision.lower()} their {req.itemName}, targeting {req.date}.

Return ONLY valid JSON (no markdown fences):
{{
  "confirmation": "One friendly confirmation sentence",
  "scheduledAction": "One concrete next action (e.g. Call to book a pickup window)"
}}"""

    raw = await generate(SCHEDULE_SYSTEM, prompt, max_output_tokens=512)
    parsed = _parse_json(raw)
    if parsed:
        return ScheduleResponse(
            confirmation=parsed.get("confirmation", "You're all set!"),
            scheduledAction=parsed.get("scheduledAction", req.date),
        )

    return ScheduleResponse(
        confirmation=f"Great choice — {req.serviceName} is ready when you are.",
        scheduledAction=f"Plan to {req.decision.lower()} your {req.itemName} {req.date}.",
    )


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
