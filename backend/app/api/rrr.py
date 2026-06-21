from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps.auth import require_user_id
from app.schemas.rrr import (
    IdentifyRequest,
    IdentifyResponse,
    ScheduleRequest,
    ScheduleResponse,
    ServicesRequest,
    ServicesResponse,
)
from app.services.rrr_identify import identify_item_from_image
from app.services.rrr_schedule import draft_schedule
from app.services.rrr_service_discovery import discover_services

router = APIRouter()


@router.post("/identify", response_model=IdentifyResponse)
async def identify_item(
    body: IdentifyRequest,
    _user_id: str = Depends(require_user_id),
):
    """Gemini vision item identification for the RRR mobile app."""
    try:
        return await identify_item_from_image(body.image)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Identification failed: {exc}") from exc


@router.post("/services", response_model=ServicesResponse)
async def find_services(
    body: ServicesRequest,
    _user_id: str = Depends(require_user_id),
):
    """Browserbase deep search + Gemini service discovery (Redis cached)."""
    if body.decision not in ("DONATE", "SELL", "DISCARD"):
        raise HTTPException(status_code=400, detail="Invalid decision")

    try:
        services = await discover_services(body)
        return ServicesResponse(services=services)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Service discovery failed. Please try again.",
        ) from exc


@router.post("/schedule", response_model=ScheduleResponse)
async def schedule_service(
    body: ScheduleRequest,
    _user_id: str = Depends(require_user_id),
):
    """Draft confirmation copy for the chosen service."""
    try:
        return await draft_schedule(body)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Scheduling failed. Please try again.",
        ) from exc
