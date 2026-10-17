from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_admin, get_current_staff_user
from app.models.user import User
from app.models.gift_card import GiftCard
from app.models.gift_card_image import GiftCardImage
from app.services.admin_service import AdminService
from app.storage.factory import get_storage
from app.schemas.card import GiftCardResponse, GiftCardUpdateRequest, GiftCardListResponse
from app.services.audit_service import record_audit_log

router = APIRouter()


def _serialize_card(card: GiftCard) -> dict:
    images_data = []
    for img in card.images:
        images_data.append({
            "id": img.id,
            "side": img.side,
            "original_url": f"/api/v1/admin/cards/{card.id}/images/{img.side}/original/stream",
            "processed_url": f"/api/v1/admin/cards/{card.id}/images/{img.side}/processed/stream",
            "thumbnail_url": f"/api/v1/admin/cards/{card.id}/images/{img.side}/processed/stream",
            "download_url": f"/api/v1/admin/cards/{card.id}/images/{img.side}/processed/download",
            "original_width": img.original_width,
            "original_height": img.original_height,
            "processed_width": img.processed_width,
            "processed_height": img.processed_height,
            "file_size": img.file_size,
            "mime_type": img.mime_type,
            "created_at": img.created_at.isoformat(),
        })

    return {
        "id": card.id,
        "reference_code": card.reference_code,
        "card_type": card.card_type,
        "status": card.status,
        "brand": card.brand,
        "denomination": card.denomination,
        "notes": card.notes,
        "pin_label": card.access_pin.label if card.access_pin else None,
        "scan_session_id": card.scan_session_id,
        "created_at": card.created_at.isoformat(),
        "updated_at": card.updated_at.isoformat(),
        "archived_at": card.archived_at.isoformat() if card.archived_at else None,
        "images": images_data,
    }


@router.get("/cards")
def list_cards(
    query: Optional[str] = Query(None, description="Search term for reference code, brand, notes"),
    card_type: Optional[str] = Query(None, description="Filter by card type (single/double)"),
    status: Optional[str] = Query(None, description="Filter by status (completed/flagged/archived)"),
    pin_id: Optional[str] = Query(None, description="Filter by access PIN ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Paginated search and filter of gift card records (Accessible to admin and employees)."""
    cards, total = AdminService.search_cards(
        db=db,
        query=query,
        card_type=card_type,
        status_filter=status,
        pin_id=pin_id,
        page=page,
        page_size=page_size,
    )
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "items": [_serialize_card(c) for c in cards],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/cards/{card_id}")
def get_card_detail(
    card_id: str,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Retrieve full detail for a single gift card (Accessible to admin and employees)."""
    card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return _serialize_card(card)


@router.patch("/cards/{card_id}")
def update_card(
    card_id: str,
    payload: GiftCardUpdateRequest,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Update internal notes, brand, denomination, or status (Accessible to admin and employees)."""
    updated = AdminService.update_card(
        db=db,
        card_id=card_id,
        brand=payload.brand,
        denomination=payload.denomination,
        notes=payload.notes,
        status=payload.status,
        admin_email=current_user.email,
    )
    return _serialize_card(updated)


@router.post("/cards/{card_id}/archive")
def archive_card(
    card_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Archive a gift card record (Admin only)."""
    archived = AdminService.archive_card(db, card_id, current_admin.email)
    return _serialize_card(archived)


@router.delete("/cards/{card_id}")
def delete_card(
    card_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Permanently delete a gift card.
    STRICTLY RESTRICTED TO ADMINISTRATOR ROLE ONLY.
    Employees do NOT have deletion privileges.
    """
    AdminService.delete_card(db, card_id, current_admin.email)
    return {"success": True, "message": "Card deleted successfully"}


@router.get("/cards/{card_id}/images/{side}/{img_type}/stream")
def stream_card_image(
    card_id: str,
    side: str,
    img_type: str,  # "original" or "processed"
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Stream card image to admin/employee interface."""
    card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    img = db.query(GiftCardImage).filter(GiftCardImage.gift_card_id == card.id, GiftCardImage.side == side).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    key = img.processed_image_key if img_type == "processed" else img.original_image_key
    storage = get_storage()
    try:
        data = storage.get_image_bytes(key)
        return StreamingResponse(io.BytesIO(data), media_type=img.mime_type)
    except Exception:
        raise HTTPException(status_code=404, detail="Image file not found in storage")


@router.get("/cards/{card_id}/images/{side}/{img_type}/download")
def download_card_image(
    card_id: str,
    side: str,
    img_type: str,  # "original" or "processed"
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Download authorized image with Content-Disposition attachment."""
    card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    img = db.query(GiftCardImage).filter(GiftCardImage.gift_card_id == card.id, GiftCardImage.side == side).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    key = img.processed_image_key if img_type == "processed" else img.original_image_key
    storage = get_storage()
    try:
        data = storage.get_image_bytes(key)
        filename = f"{card.reference_code}_{side}_{img_type}.jpg"

        record_audit_log(
            db=db,
            actor_type="staff",
            actor_id=current_user.email,
            action="IMAGE_DOWNLOADED",
            resource_type="gift_card",
            resource_id=card.id,
            metadata={"filename": filename, "side": side, "role": current_user.role},
        )

        return StreamingResponse(
            io.BytesIO(data),
            media_type=img.mime_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Image file not found in storage")
