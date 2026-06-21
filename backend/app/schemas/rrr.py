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
