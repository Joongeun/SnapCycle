from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.agent.orchestrator import get_recycling_instructions
from app.agent.schemas import RecycleRequest, RecycleResponse

router = APIRouter()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


@router.post("/", response_model=RecycleResponse)
async def recycle_item(request: RecycleRequest, req: Request):
    """
    Recycling instructions from text and/or base64 image.
    Provide `item` text, `image_base64`, or both (image used for identification).
    """
    try:
        return await get_recycling_instructions(request, _get_client_ip(req))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/upload", response_model=RecycleResponse)
async def recycle_item_upload(
    req: Request,
    image: UploadFile = File(..., description="Photo of the item"),
    item: Optional[str] = Form(None, description="Optional text hint for the item"),
    location_id: Optional[str] = Form(None),
):
    """Recycling instructions from an uploaded image file."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Upload must be an image file")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="Empty image file")

    request = RecycleRequest.model_construct(item=item, location_id=location_id)
    try:
        return await get_recycling_instructions(
            request,
            _get_client_ip(req),
            image_bytes=image_bytes,
            image_media_type=image.content_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
