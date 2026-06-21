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


class DisposalOptionsResponse(BaseModel):
    cards: List[DisposalCard]


# --- Yelp haulers ----------------------------------------------------------

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
