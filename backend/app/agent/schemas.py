from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class CacheLayers(BaseModel):
    ip_cache_hit: bool = False
    item_vector_hit: bool = False
    rule_cache_hit: bool = False  # Redis reference found
    browserbase_research: bool = False
    vision_used: bool = False

    def any_hit(self) -> bool:
        return self.ip_cache_hit or self.item_vector_hit or self.rule_cache_hit


class RecycleRequest(BaseModel):
    item: Optional[str] = Field(None, description="Item text label (optional if image provided)")
    image_base64: Optional[str] = Field(None, description="Base64-encoded image of the item")
    image_media_type: Optional[str] = Field("image/jpeg", description="MIME type when using image_base64")
    location_id: Optional[str] = Field(None, description="Override auto-detected location")
    keywords: Optional[List[str]] = Field(None, description="Extra search terms from frontend")

    @model_validator(mode="after")
    def require_item_or_image(self) -> "RecycleRequest":
        if not self.item and not self.image_base64:
            raise ValueError("Provide either 'item' text or 'image_base64'")
        return self


class RecycleResponse(BaseModel):
    item: str
    item_id: str
    location_id: str
    location_name: str
    category: str
    accepted: bool = False
    instructions: str
    steps: List[str]
    sources: List[str]
    matched_rules: List[str]
    reference_count: int = 0
    from_image: bool = False
    cached: bool = False
    dynamic_location: bool = False
    cache: CacheLayers = Field(default_factory=CacheLayers)


class LocationDetectResponse(BaseModel):
    location_id: str
    location_name: str
    detected_city: Optional[str] = None
    detected_region: Optional[str] = None
    detected_zip: Optional[str] = None
    ip: str
    ip_cache_hit: bool = False
    dynamic: bool = False
