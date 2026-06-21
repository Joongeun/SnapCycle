from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Decision = Literal["DONATE", "SELL", "DISCARD"]
ItemCategory = Literal[
    "furniture", "appliance", "electronics", "clothing", "decor", "sports", "other"
]
ItemCondition = Literal["excellent", "good", "fair", "poor"]


class IdentifyRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded JPEG/PNG")


class IdentifyResponse(BaseModel):
    itemName: str
    category: ItemCategory
    condition: ItemCondition = "good"
    description: str = ""


class ServicesRequest(BaseModel):
    itemName: str
    category: ItemCategory
    condition: ItemCondition
    decision: Decision
    location: str


class ServiceOption(BaseModel):
    name: str
    description: str
    url: str
    phone: Optional[str] = None
    address: Optional[str] = None


class ServicesResponse(BaseModel):
    services: List[ServiceOption]


class ScheduleRequest(BaseModel):
    serviceName: str
    itemName: str
    decision: str
    date: str


class ScheduleResponse(BaseModel):
    confirmation: str
    scheduledAction: str


# --- Disposal options (RAG → ranked DisposalCards) -------------------------

DisposalMethod = Literal[
    "donation",
    "city_bulky_pickup",
    "junk_haulers",
    "recycling_collective",
    "hhw",
    "ewaste",
]
SchedulingMethod = Literal["web_form", "phone", "hauler_bids"]


class DisposalCardStats(BaseModel):
    costUsd: Optional[float] = None
    ecoScore: int = 50
    doorfrontPickup: bool = False
    driveDistanceMi: Optional[float] = None


class DisposalSubOption(BaseModel):
    name: str
    note: Optional[str] = None


class DisposalCard(BaseModel):
    method: DisposalMethod
    title: str
    stats: DisposalCardStats
    subOptions: List[DisposalSubOption] = []
    schedulingMethod: SchedulingMethod
    phone: Optional[str] = None
    formUrl: Optional[str] = None


class DisposalOptionsRequest(BaseModel):
    itemName: str
    category: ItemCategory
    location: str
    zip: str = ""
    # Free-text note from the user, e.g. "it's broken / won't turn on". Lets the
    # agent route damaged electronics to e-waste/recycling instead of donation.
    note: str = ""


class DisposalOptionsResponse(BaseModel):
    cards: List[DisposalCard]


# --- In-home triage (refined agent — runs FIRST) ---------------------------

DisposalBin = Literal["trash", "recycling"]


class TriageRequest(BaseModel):
    itemName: str
    category: ItemCategory
    location: str = ""
    zip: str = ""
    # Free-text note, e.g. "screen is cracked / it's broken". Damaged items
    # (especially electronics) should not be assumed home-disposable or donatable.
    note: str = ""


class TriageResponse(BaseModel):
    disposableAtHome: bool
    bin: Optional[DisposalBin] = None
    message: str = ""


# --- Card detail (Agent 1 research) + recommendation (Agent 2 decide) -------

RecommendationMode = Literal["summary", "form", "phone"]


class CardDetail(BaseModel):
    nextSteps: List[str] = []
    constraints: List[str] = []
    summary: str = ""
    sourceUrl: Optional[str] = None
    formUrl: Optional[str] = None
    phone: Optional[str] = None


class Recommendation(BaseModel):
    mode: RecommendationMode
    summary: str = ""
    recommendation: str = ""
    sourceUrl: Optional[str] = None
    formUrl: Optional[str] = None
    phone: Optional[str] = None


class CardDetailRequest(BaseModel):
    card: DisposalCard
    itemName: str
    category: ItemCategory = "other"
    location: str = ""
    zip: str = ""


# --- Redis agent memory (learned user preferences) -------------------------

PreferenceEvent = Literal["card_selected", "disposal_completed", "service_search", "triage_home"]


class PreferenceRecordRequest(BaseModel):
    event: PreferenceEvent
    itemName: str = ""
    category: ItemCategory = "other"
    disposalMethod: Optional[DisposalMethod] = None
    decision: Optional[Decision] = None
    location: str = ""
    zip: str = ""


class PreferenceTag(BaseModel):
    id: str
    label: str
    tone: Literal["neutral", "donate", "sell", "discard", "accent"] = "neutral"
    source: str = "history"


class UserPreferenceMemoryResponse(BaseModel):
    tags: List[PreferenceTag] = []
    inferred: dict = {}
    stats: dict = {}
    recentEvents: List[dict] = []
    updatedAt: Optional[str] = None


class CardDetailResponse(BaseModel):
    detail: CardDetail
    recommendation: Recommendation


# --- Onboarding location research (persistent RAG) -------------------------

class ResearchRequest(BaseModel):
    zip: str
    address: str = ""


class ResearchResponse(BaseModel):
    status: Literal["ready", "cached"]
    locationId: str
    summary: str = ""


# --- Chat agent ------------------------------------------------------------

class ChatRequest(BaseModel):
    question: str
    location: str = ""
    zip: str = ""
    itemName: Optional[str] = None
    cards: List[DisposalCard] = []


class ChatResponse(BaseModel):
    answer: str
    sources: List[str] = []


# --- Agent S form-filling over Browserbase ---------------------------------

class AgentFormProfile(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip: Optional[str] = None


class AgentFormRequest(BaseModel):
    formUrl: str
    profile: AgentFormProfile = AgentFormProfile()
    itemName: str = ""
    itemDescription: str = ""


class AgentFormSession(BaseModel):
    sessionId: str
    liveViewUrl: str
    status: Literal["filling", "ready", "error"] = "filling"
    detail: str = ""


# --- Local junk haulers (Browserbase discovery → Twilio SMS bids) ----------

class HaulersRequest(BaseModel):
    location: str
    itemName: Optional[str] = None


class Hauler(BaseModel):
    haulerName: str
    rating: float
    distanceMi: float
    phone: str
    url: Optional[str] = None


class HaulersResponse(BaseModel):
    haulers: List[Hauler]


class StartBidsRequest(BaseModel):
    """Discover local haulers and text them all a templated quote request."""
    location: str
    itemName: str = ""
    itemDescription: str = ""
    zip: str = ""
    maxHaulers: int = 3
    # Base64-encoded item photo (no data: prefix). When set and PUBLIC_BASE_URL is
    # configured, it's attached to the hauler texts as an MMS image.
    imageBase64: str = ""
    imageContentType: str = "image/jpeg"


class HaulerQuote(BaseModel):
    haulerName: str
    rating: float = 0.0
    distanceMi: float = 0.0
    phone: str
    priceUsd: Optional[float] = None
    # "pending" until the hauler texts back; "replied" once a quote (or message)
    # arrives; "no_sms" when the number couldn't be texted (e.g. landline).
    status: Literal["pending", "replied", "no_sms"] = "pending"
    reply: str = ""


class BidSession(BaseModel):
    sessionId: str
    status: Literal["collecting", "done", "error"] = "collecting"
    detail: str = ""
    quotes: List[HaulerQuote] = []
