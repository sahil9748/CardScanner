from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Response
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_customer_session
from app.models.scan_session import ScanSession
from app.models.gift_card_image import GiftCardImage
from app.services.session_service import SessionService
from app.services.card_service import CardService
from app.storage.factory import get_storage
from app.schemas.session import SessionResponse, SessionInitRequest, CompleteSessionResponse

router = APIRouter()


def _format_session_response(session: ScanSession) -> dict:
    remaining = None
    if session.access_pin and session.access_pin.max_completed_scans is not None:
        remaining = max(0, session.access_pin.max_completed_scans - session.access_pin.completed_scans)

    images_info = []
    for img in session.images:
        images_info.append({
            "side": img.side,
            "original_url": f"/api/v1/sessions/{session.id}/images/{img.side}/original",
            "processed_url": f"/api/v1/sessions/{session.id}/images/{img.side}/processed",
            "original_width": img.original_width,
            "original_height": img.original_height,
            "processed_width": img.processed_width,
            "processed_height": img.processed_height,
            "file_size": img.file_size,
            "created_at": img.created_at.isoformat(),
        })

    return {
        "id": session.id,
        "card_type": session.card_type,
        "status": session.status,
        "front_capture_status": session.front_capture_status,
        "back_capture_status": session.back_capture_status,
        "created_at": session.created_at.isoformat(),
        "expires_at": session.expires_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "pin_label": session.access_pin.label if session.access_pin else None,
        "remaining_scans": remaining,
        "images": images_info,
    }


@router.get("/current", status_code=status.HTTP_200_OK)
def get_current_session(
    current_session: ScanSession = Depends(get_current_customer_session),
):
    """Retrieve the customer's current active scanning session."""
    return _format_session_response(current_session)


@router.post("/card-type", status_code=status.HTTP_200_OK)
def update_card_type(
    payload: SessionInitRequest,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """Select or switch card type between 'single' and 'double'."""
    updated = SessionService.update_card_type(db, current_session, payload.card_type)
    return _format_session_response(updated)


@router.post("/{session_id}/images/{side}", status_code=status.HTTP_200_OK)
async def upload_session_image(
    session_id: str,
    side: str,
    original_file: UploadFile = File(...),
    processed_file: UploadFile = File(...),
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Upload original and perspective-corrected processed images for card front or back.
    Enforces that customer can only upload to their own session.
    """
    if current_session.id != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You can only upload images to your own session.",
        )

    original_bytes = await original_file.read()
    processed_bytes = await processed_file.read()

    image_record = SessionService.store_session_image(
        db=db,
        session=current_session,
        side=side,
        original_bytes=original_bytes,
        processed_bytes=processed_bytes,
    )

    return {
        "success": True,
        "session_id": current_session.id,
        "side": side,
        "image_id": image_record.id,
        "session_status": current_session.status,
        "front_status": current_session.front_capture_status,
        "back_status": current_session.back_capture_status,
        "processed_url": f"/api/v1/sessions/{current_session.id}/images/{side}/processed",
    }


@router.post("/{session_id}/retake/{side}", status_code=status.HTTP_200_OK)
def retake_session_image(
    session_id: str,
    side: str,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Allow customer to retake front or back independently without resetting the other side.
    """
    if current_session.id != session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    updated = SessionService.retake_side(db, current_session, side)
    return _format_session_response(updated)


@router.post("/{session_id}/complete", status_code=status.HTTP_200_OK)
def complete_session(
    session_id: str,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Complete the scanning session and create a completed gift card record.
    Transactionally enforces:
    - Single-sided: requires front image.
    - Two-sided: requires front AND back images. Rejects incomplete scans!
    - Increments PIN completed_scans.
    """
    if current_session.id != session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    card = CardService.complete_scan_session(db, current_session)

    return {
        "success": True,
        "session_id": current_session.id,
        "gift_card_id": card.id,
        "reference_code": card.reference_code,
        "status": "completed",
        "message": "Card scan saved successfully!",
    }


@router.post("/{session_id}/cancel", status_code=status.HTTP_200_OK)
def cancel_session(
    session_id: str,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """Mark session as cancelled or incomplete."""
    if current_session.id != session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    SessionService.mark_session_incomplete(db, current_session)
    return {"success": True, "status": "incomplete"}


@router.get("/{session_id}/images/{side}/{img_type}")
def get_session_image_stream(
    session_id: str,
    side: str,
    img_type: str,  # "original" or "processed"
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Private authorized image stream: Customer can only stream images from their own session.
    Prevents enumeration / IDOR vulnerabilities.
    """
    if current_session.id != session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    img_record = (
        db.query(GiftCardImage)
        .filter(GiftCardImage.scan_session_id == session_id, GiftCardImage.side == side)
        .first()
    )
    if not img_record:
        raise HTTPException(status_code=404, detail="Image not found")

    storage_key = img_record.processed_image_key if img_type == "processed" else img_record.original_image_key
    storage = get_storage()
    try:
        data = storage.get_image_bytes(storage_key)
        return StreamingResponse(io.BytesIO(data), media_type=img_record.mime_type)
    except Exception:
        raise HTTPException(status_code=404, detail="Image file unavailable in storage")
