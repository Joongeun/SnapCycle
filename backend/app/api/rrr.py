from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps.auth import require_user_id
from app.schemas.rrr import (
    AgentFormRequest,
    AgentFormSession,
    CardDetailRequest,
    CardDetailResponse,
    ChatRequest,
    ChatResponse,
    DisposalOptionsRequest,
    DisposalOptionsResponse,
    HaulersRequest,
    HaulersResponse,
    IdentifyRequest,
    IdentifyResponse,
    ResearchRequest,
    ResearchResponse,
    ScheduleRequest,
    ScheduleResponse,
    ServicesRequest,
    ServicesResponse,
    TriageRequest,
    TriageResponse,
)
from app.services.agent_s import get_form_status, start_form_fill
from app.services.rrr_card_agent import get_card_detail
from app.services.rrr_chat import answer_question
from app.services.rrr_disposal import discover_disposal_options
from app.services.rrr_haulers import find_haulers
from app.services.rrr_identify import identify_item_from_image
from app.services.rrr_location_research import research_location
from app.services.rrr_schedule import draft_schedule
from app.services.rrr_service_discovery import discover_services
from app.services.rrr_triage import triage_item

router = APIRouter()


@router.post("/research", response_model=ResearchResponse)
async def research(
    body: ResearchRequest,
    _user_id: str = Depends(require_user_id),
):
    """One-time onboarding research → persistent location RAG in Redis."""
    try:
        record = await research_location(body.zip, body.address)
        return ResearchResponse(
            status="cached" if record.get("status") == "cached" else "ready",
            locationId=body.zip,
            summary=record.get("summary", ""),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Location research failed. Please try again."
        ) from exc


@router.post("/triage", response_model=TriageResponse)
async def triage(
    body: TriageRequest,
    _user_id: str = Depends(require_user_id),
):
    """First-pass agent: can this go in the home trash/recycling?"""
    try:
        return await triage_item(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Triage failed. Please try again.") from exc


@router.post("/card-detail", response_model=CardDetailResponse)
async def card_detail(
    body: CardDetailRequest,
    _user_id: str = Depends(require_user_id),
):
    """Two agents: research the chosen pathway, then recommend a course of action."""
    try:
        return await get_card_detail(body)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Could not load pathway details. Please try again."
        ) from exc


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    _user_id: str = Depends(require_user_id),
):
    """Chat agent grounded in the location RAG + on-screen options."""
    try:
        return await answer_question(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Chat failed. Please try again.") from exc


@router.post("/agent/form", response_model=AgentFormSession)
async def agent_form_start(
    body: AgentFormRequest,
    _user_id: str = Depends(require_user_id),
):
    """Start Agent S filling a form over a Browserbase cloud session."""
    try:
        return await start_form_fill(body)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Could not start the form agent. Please try again."
        ) from exc


@router.get("/agent/form/{session_id}", response_model=AgentFormSession)
async def agent_form_status(
    session_id: str,
    _user_id: str = Depends(require_user_id),
):
    """Poll the Agent S form-fill status."""
    state = get_form_status(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Unknown form session")
    return state


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


@router.post("/disposal-options", response_model=DisposalOptionsResponse)
async def disposal_options(
    body: DisposalOptionsRequest,
    _user_id: str = Depends(require_user_id),
):
    """Browserbase deep search + Redis cache + Gemini → ranked DisposalCards."""
    try:
        cards = await discover_disposal_options(body)
        return DisposalOptionsResponse(cards=cards)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not find disposal options. Please try again.",
        ) from exc


@router.post("/haulers", response_model=HaulersResponse)
async def haulers(
    body: HaulersRequest,
    _user_id: str = Depends(require_user_id),
):
    """Yelp Fusion search for local junk-removal haulers (tap-to-call)."""
    try:
        found = await find_haulers(body)
        return HaulersResponse(haulers=found)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not find haulers. Please try again.",
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
