from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Response, Request
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_customer_session, get_client_ip
from app.models.scan_session import ScanSession
from app.models.gift_card_image import GiftCardImage
from app.services.session_service import SessionService
from app.services.card_service import CardService
from app.storage.factory import get_storage
from app.schemas.session import SessionResponse, SessionInitRequest, CompleteSessionResponse
from app.core.config import settings

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


def _create_and_cookie_next_session(
    response: Response,
    request: Request,
    db: Session,
    current_session: ScanSession,
) -> ScanSession:
    """Helper to start the next card scan session and set the updated cookie."""
    pin = current_session.access_pin
    if not pin or pin.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access PIN is no longer active.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if pin.expires_at and pin.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access PIN has expired.",
        )

    if pin.max_completed_scans is not None and pin.completed_scans >= pin.max_completed_scans:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="All scans for this PIN have been completed.",
        )

    client_ip = get_client_ip(request)
    new_session = SessionService.create_session_for_pin(
        db=db,
        pin=pin,
        card_type=current_session.card_type,
        client_ip=client_ip,
    )

    is_secure = settings.COOKIE_SECURE and (
        request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    )
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=new_session.session_token,
        httponly=True,
        secure=is_secure,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.SESSION_EXPIRY_MINUTES * 60,
        path="/",
    )
    return new_session


@router.get("/current", status_code=status.HTTP_200_OK)
def get_current_session(
    response: Response,
    request: Request,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Retrieve the customer's current active scanning session.
    If the previous card scan was completed and the PIN has scans remaining,
    automatically creates and returns a new active scanning session for the next card.
    """
    if current_session.status == "completed":
        pin = current_session.access_pin
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if pin and pin.status == "active" and (pin.expires_at is None or pin.expires_at > now):
            if pin.max_completed_scans is None or pin.completed_scans < pin.max_completed_scans:
                new_session = _create_and_cookie_next_session(response, request, db, current_session)
                return _format_session_response(new_session)

    return _format_session_response(current_session)


@router.post("/next", status_code=status.HTTP_200_OK)
def start_next_session(
    response: Response,
    request: Request,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Start the next scanning session for the authenticated PIN if allowance remains.
    """
    new_session = _create_and_cookie_next_session(response, request, db, current_session)
    return _format_session_response(new_session)


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
    response: Response,
    request: Request,
    original_file: UploadFile = File(...),
    processed_file: UploadFile = File(...),
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """
    Upload original and processed images for card front or back.
    If current session is already in 'completed' state and scans remain on the PIN,
    automatically creates the next session seamlessly.
    """
    target_session = current_session

    # Security check: must match current session or belong to the same authorized PIN
    if current_session.id != session_id:
        queried = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if queried and queried.access_pin_id == current_session.access_pin_id:
            target_session = queried
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: You can only upload images to your own session.",
            )

    # If target session was already completed, auto-spawn next session if scans remain
    if target_session.status == "completed":
        pin = target_session.access_pin
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if pin and pin.status == "active" and (pin.expires_at is None or pin.expires_at > now):
            if pin.max_completed_scans is None or pin.completed_scans < pin.max_completed_scans:
                target_session = _create_and_cookie_next_session(response, request, db, target_session)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="All scans for this PIN have been completed.",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot upload image to session in 'completed' state.",
            )

    original_bytes = await original_file.read()
    processed_bytes = await processed_file.read()

    image_record = SessionService.store_session_image(
        db=db,
        session=target_session,
        side=side,
        original_bytes=original_bytes,
        processed_bytes=processed_bytes,
    )

    return {
        "success": True,
        "session_id": target_session.id,
        "side": side,
        "image_id": image_record.id,
        "session_status": target_session.status,
        "front_status": target_session.front_capture_status,
        "back_status": target_session.back_capture_status,
        "processed_url": f"/api/v1/sessions/{target_session.id}/images/{side}/processed",
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
    target_session = current_session
    if current_session.id != session_id:
        queried = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if queried and queried.access_pin_id == current_session.access_pin_id:
            target_session = queried
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    updated = SessionService.retake_side(db, target_session, side)
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
    target_session = current_session
    if current_session.id != session_id:
        queried = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if queried and queried.access_pin_id == current_session.access_pin_id:
            target_session = queried
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    card = CardService.complete_scan_session(db, target_session)

    return {
        "success": True,
        "session_id": target_session.id,
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

    updated = SessionService.cancel_session(db, current_session)
    return _format_session_response(updated)


@router.get("/{session_id}/images/{side}/original")
def get_original_image(
    session_id: str,
    side: str,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """Securely stream original card image exclusively to the session owner."""
    if current_session.id != session_id:
        queried = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if not (queried and queried.access_pin_id == current_session.access_pin_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    image_record = (
        db.query(GiftCardImage)
        .filter(GiftCardImage.scan_session_id == session_id, GiftCardImage.side == side)
        .first()
    )
    if not image_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    storage = get_storage()
    data, content_type = storage.get_image(image_record.original_image_key)
    return StreamingResponse(io.BytesIO(data), media_type=content_type)


@router.get("/{session_id}/images/{side}/processed")
def get_processed_image(
    session_id: str,
    side: str,
    current_session: ScanSession = Depends(get_current_customer_session),
    db: Session = Depends(get_db),
):
    """Securely stream perspective-corrected card image."""
    if current_session.id != session_id:
        queried = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if not (queried and queried.access_pin_id == current_session.access_pin_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    image_record = (
        db.query(GiftCardImage)
        .filter(GiftCardImage.scan_session_id == session_id, GiftCardImage.side == side)
        .first()
    )
    if not image_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    storage = get_storage()
    data, content_type = storage.get_image(image_record.processed_image_key)
    return StreamingResponse(io.BytesIO(data), media_type=content_type)
