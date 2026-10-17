from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.api.deps import get_current_staff_user
from app.models.user import User
from app.models.access_pin import AccessPin
from app.services.pin_service import PinService
from app.schemas.pin import (
    PinCreateRequest,
    PinBatchCreateRequest,
    PinUpdateRequest,
    PinItemResponse,
    CreatedPinInfo,
)

router = APIRouter()


@router.get("/access-pins")
def list_access_pins(
    status_filter: Optional[str] = Query(None, description="Filter by status (active/expired/revoked/exhausted)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """List access PINs with usage statistics and status (Accessible to admin and employees)."""
    q = db.query(AccessPin)
    if status_filter:
        q = q.filter(AccessPin.status == status_filter)

    total = q.count()
    pins = q.order_by(desc(AccessPin.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    items = [
        PinItemResponse.model_validate(p) for p in pins
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/access-pins", response_model=CreatedPinInfo)
def create_single_pin(
    payload: PinCreateRequest,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """
    Generate a new 4 or 5 digit numeric PIN preserving leading zeros.
    The plaintext PIN is returned in this response ONLY and is never exposed again.
    (Accessible to admin and employees).
    """
    pin_model, plain_pin = PinService.generate_single_pin(
        db=db,
        pin_length=payload.pin_length,
        label=payload.label,
        max_completed_scans=payload.max_completed_scans,
        expires_at=payload.expires_at,
        created_by=current_user.email,
    )

    return CreatedPinInfo(
        id=pin_model.id,
        pin=plain_pin,
        pin_length=pin_model.pin_length,
        label=pin_model.label,
        status=pin_model.status,
        max_completed_scans=pin_model.max_completed_scans,
        expires_at=pin_model.expires_at,
        created_at=pin_model.created_at,
    )


@router.post("/access-pins/batch")
def create_batch_pins(
    payload: PinBatchCreateRequest,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """
    Batch generate up to 50 unique numeric PINs.
    Returns list of items with their one-time plaintext PINs.
    (Accessible to admin and employees).
    """
    created_list = PinService.generate_batch_pins(
        db=db,
        count=payload.count,
        pin_length=payload.pin_length,
        label_prefix=payload.label_prefix,
        max_completed_scans=payload.max_completed_scans,
        expires_at=payload.expires_at,
        created_by=current_user.email,
    )

    return {
        "count": len(created_list),
        "items": [
            {
                "id": p.id,
                "pin": plain,
                "pin_length": p.pin_length,
                "label": p.label,
                "status": p.status,
                "max_completed_scans": p.max_completed_scans,
                "expires_at": p.expires_at.isoformat() if p.expires_at else None,
                "created_at": p.created_at.isoformat(),
            }
            for p, plain in created_list
        ],
    }


@router.post("/access-pins/{pin_id}/revoke")
def revoke_pin(
    pin_id: str,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Revoke an active PIN immediately."""
    revoked = PinService.revoke_pin(db, pin_id=pin_id, admin_email=current_user.email)
    return PinItemResponse.model_validate(revoked)


@router.patch("/access-pins/{pin_id}")
def update_pin(
    pin_id: str,
    payload: PinUpdateRequest,
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Update PIN label, status, max completed scans, or expiration."""
    pin = db.query(AccessPin).filter(AccessPin.id == pin_id).first()
    if not pin:
        raise HTTPException(status_code=404, detail="PIN not found")

    if payload.label is not None:
        pin.label = payload.label
    if payload.status is not None:
        pin.status = payload.status
    if payload.max_completed_scans is not None:
        pin.max_completed_scans = payload.max_completed_scans
    if payload.expires_at is not None:
        pin.expires_at = payload.expires_at

    db.commit()
    db.refresh(pin)
    return PinItemResponse.model_validate(pin)
