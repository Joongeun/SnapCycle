from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.config import settings
from app.deps.auth import require_user_id
from app.schemas.rrr import (
    AgentFormRequest,
    AgentFormSession,
    BidSession,
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
    StartBidsRequest,
    TriageRequest,
    TriageResponse,
    PreferenceRecordRequest,
    UserPreferenceMemoryResponse,
)
from app.services.agent_s import get_form_status, start_form_fill
from app.services.rrr_card_agent import get_card_detail
from app.services.rrr_chat import answer_question
from app.services.rrr_disposal import discover_disposal_options
from app.services.rrr_haulers import discover_haulers
from app.services.rrr_identify import identify_item_from_image
from app.services.rrr_location_research import research_location
from app.services.rrr_schedule import draft_schedule
from app.services.rrr_service_discovery import discover_services
from app.services.rrr_triage import triage_item
from app.services.twilio_bids import get_bids, get_media, handle_inbound_sms, start_bids
from app.services.user_preference_memory import (
    get_user_preference_memory,
    record_preference_event,
)

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
    user_id: str = Depends(require_user_id),
):
    """Two agents: research the chosen pathway, then recommend a course of action."""
    try:
        await record_preference_event(
            user_id,
            event="card_selected",
            item_name=body.itemName,
            category=body.category,
            disposal_method=body.card.method,
            location=body.location,
            zip_code=body.zip,
        )
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
    """Poll the Agent S form-fill status (shared by the Yelp outreach flow)."""
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
    user_id: str = Depends(require_user_id),
):
    """Browserbase deep search + Gemini service discovery (Redis cached)."""
    if body.decision not in ("DONATE", "SELL", "DISCARD"):
        raise HTTPException(status_code=400, detail="Invalid decision")

    try:
        await record_preference_event(
            user_id,
            event="service_search",
            item_name=body.itemName,
            category=body.category,
            decision=body.decision,
            location=body.location,
        )
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
    """Browserbase agent: discover local junk-removal haulers (tap-to-call list)."""
    try:
        found = await discover_haulers(body)
        return HaulersResponse(haulers=found)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not find haulers. Please try again.",
        ) from exc


@router.post("/haulers/bids", response_model=BidSession)
async def haulers_bids_start(
    body: StartBidsRequest,
    _user_id: str = Depends(require_user_id),
):
    """Discover local haulers and text them all a templated quote request (Twilio)."""
    try:
        return await start_bids(body)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Could not start the hauler bids. Please try again."
        ) from exc


@router.get("/haulers/bids/{session_id}", response_model=BidSession)
async def haulers_bids_status(
    session_id: str,
    _user_id: str = Depends(require_user_id),
):
    """Poll a bids session — quotes stream in as haulers text back."""
    session = await get_bids(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown bids session")
    return session


@router.get("/haulers/media/{media_id}")
async def haulers_media(media_id: str):
    """Public item photo for Twilio MMS to fetch (unauthenticated)."""
    data = await get_media(media_id)
    if not data or not data.get("b64"):
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        raw = base64.b64decode(data["b64"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Bad media") from exc
    return Response(content=raw, media_type=data.get("ct", "image/jpeg"))


@router.post("/haulers/sms-webhook")
async def haulers_sms_webhook(request: Request):
    """Twilio inbound SMS webhook — a hauler's reply becomes a quote.

    Unauthenticated (Twilio calls it). Set TWILIO_VALIDATE_SIGNATURE=true to enforce
    X-Twilio-Signature validation. Always returns empty TwiML so Twilio doesn't retry.
    """
    form = await request.form()
    from_number = str(form.get("From", ""))
    body = str(form.get("Body", ""))

    if settings.twilio_validate_signature:
        if not _valid_twilio_signature(request, dict(form)):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    if from_number:
        try:
            await handle_inbound_sms(from_number, body)
        except Exception:  # noqa: BLE001 — never fail the webhook; Twilio would retry
            pass
    return Response(content="<Response></Response>", media_type="application/xml")


def _valid_twilio_signature(request: Request, params: dict) -> bool:
    try:
        from twilio.request_validator import RequestValidator

        validator = RequestValidator(settings.twilio_auth_token)
        signature = request.headers.get("X-Twilio-Signature", "")
        url = str(request.url)
        return validator.validate(url, params, signature)
    except Exception:  # noqa: BLE001
        return False


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


@router.get("/preferences/memory", response_model=UserPreferenceMemoryResponse)
async def preferences_memory(
    user_id: str = Depends(require_user_id),
):
    """Redis agent memory — inferred preferences from request history."""
    data = await get_user_preference_memory(user_id)
    return UserPreferenceMemoryResponse(**data)


@router.post("/preferences/record", response_model=UserPreferenceMemoryResponse)
async def preferences_record(
    body: PreferenceRecordRequest,
    user_id: str = Depends(require_user_id),
):
    """Record a disposal interaction into Redis long-term user memory."""
    await record_preference_event(
        user_id,
        event=body.event,
        item_name=body.itemName,
        category=body.category,
        disposal_method=body.disposalMethod,
        decision=body.decision,
        location=body.location,
        zip_code=body.zip,
    )
    data = await get_user_preference_memory(user_id)
    return UserPreferenceMemoryResponse(**data)
