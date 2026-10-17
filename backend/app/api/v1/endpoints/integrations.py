from typing import Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_api_key_auth
from app.models.api_key import ApiKey
from app.models.access_pin import AccessPin
from app.models.gift_card import GiftCard
from app.models.gift_card_image import GiftCardImage
from app.services.pin_service import PinService
from app.core.security import compute_pin_hmac
from app.core.config import settings
from app.storage.factory import get_storage
from app.schemas.integration import (
    IntegrationPinCreateRequest,
    IntegrationPinResponse,
    IntegrationPinStatusResponse,
    IntegrationCardItem,
    IntegrationCardImageItem,
)

router = APIRouter()


@router.post("/pins", response_model=IntegrationPinResponse, status_code=status.HTTP_201_CREATED)
def create_pin_for_external_app(
    payload: IntegrationPinCreateRequest,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Generate an Access PIN and Magic Link on behalf of an external application.
    The customer can open the scan_url to instantly begin capturing their gift card.
    """
    expires_at = None
    if payload.expires_in_hours:
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=payload.expires_in_hours)

    card_type = payload.card_type.lower() if payload.card_type in ("single", "double") else "single"
    pin_len = payload.pin_length if payload.pin_length in (4, 5) else 4

    pin_model, plain_pin = PinService.generate_single_pin(
        db=db,
        pin_length=pin_len,
        label=payload.label or f"API-{api_key.name}",
        card_type=card_type,
        max_completed_scans=payload.max_scans,
        expires_at=expires_at,
        created_by=f"api_key:{api_key.id}",
        webhook_url=payload.webhook_url,
        redirect_url=payload.redirect_url,
        api_key_id=api_key.id,
    )

    scan_url = f"{settings.BASE_URL}/?pin={plain_pin}"

    return IntegrationPinResponse(
        success=True,
        pin=plain_pin,
        pin_id=pin_model.id,
        scan_url=scan_url,
        label=pin_model.label,
        card_type=pin_model.card_type,
        status=pin_model.status,
        max_scans=pin_model.max_completed_scans,
        completed_scans=pin_model.completed_scans,
        expires_at=pin_model.expires_at.isoformat() if pin_model.expires_at else None,
        webhook_url=pin_model.webhook_url,
        redirect_url=pin_model.redirect_url,
    )


@router.get("/pins/{pin_or_id}", response_model=IntegrationPinStatusResponse)
def get_pin_status(
    pin_or_id: str,
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Look up PIN status and preview uploaded cards.
    Supports either the 36-char PIN UUID or the numeric PIN string.
    """
    pin = None
    if len(pin_or_id) == 36 and "-" in pin_or_id:
        pin = db.query(AccessPin).filter(AccessPin.id == pin_or_id).first()
    else:
        hmac_val = compute_pin_hmac(pin_or_id.strip())
        pin = db.query(AccessPin).filter(AccessPin.pin_hmac == hmac_val).first()

    if not pin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PIN not found")

    # Fetch completed gift cards for this PIN
    cards = db.query(GiftCard).filter(GiftCard.access_pin_id == pin.id).all()
    card_items = []
    for c in cards:
        image_items = []
        for img in c.images:
            image_items.append(
                IntegrationCardImageItem(
                    side=img.side,
                    preview_url=f"{settings.BASE_URL}/api/v1/integrations/cards/{c.id}/images/{img.side}",
                    original_url=f"{settings.BASE_URL}/api/v1/integrations/cards/{c.id}/images/{img.side}?type=original",
                    width=img.processed_width,
                    height=img.processed_height,
                    mime_type=img.mime_type,
                )
            )
        card_items.append(
            IntegrationCardItem(
                id=c.id,
                reference_code=c.reference_code,
                card_type=c.card_type,
                status=c.status,
                created_at=c.created_at.isoformat(),
                images=image_items,
            )
        )

    # Determine status
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    status_str = pin.status
    if pin.status == "active" and pin.expires_at and now > pin.expires_at:
        status_str = "expired"
    elif pin.max_completed_scans is not None and pin.completed_scans >= pin.max_completed_scans:
        status_str = "completed"

    return IntegrationPinStatusResponse(
        pin_id=pin.id,
        label=pin.label,
        status=status_str,
        completed_scans=pin.completed_scans,
        max_scans=pin.max_completed_scans,
        expires_at=pin.expires_at.isoformat() if pin.expires_at else None,
        scan_url=f"{settings.BASE_URL}/?pin={pin.id}",
        cards=card_items,
    )


@router.get("/cards/{card_id}/images/{side}")
def stream_card_image_for_external_app(
    card_id: str,
    side: str,
    type: str = Query("processed", pattern="^(processed|original)$"),
    api_key: ApiKey = Depends(get_api_key_auth),
    db: Session = Depends(get_db),
):
    """
    Stream gift card image directly for embedding in external webapp preview cards or <img> tags.
    Authentication accepted via 'X-API-Key' header, 'Bearer' token, or '?api_key=' query param.
    """
    card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gift card not found")

    image = (
        db.query(GiftCardImage)
        .filter(GiftCardImage.gift_card_id == card.id, GiftCardImage.side == side)
        .first()
    )
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Image for side '{side}' not found")

    key = image.processed_image_key if type == "processed" else image.original_image_key
    storage = get_storage()
    try:
        data, content_type = storage.get_image(key)
        return StreamingResponse(
            io.BytesIO(data),
            media_type=content_type or image.mime_type or "image/jpeg",
            headers={
                "Cache-Control": "private, max-age=86400",
                "Content-Disposition": f'inline; filename="{card.reference_code}_{side}_{type}.jpg"',
            },
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file not found in storage")
