from fastapi import APIRouter, Depends, Response, Request, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_client_ip
from app.schemas.pin import PinValidateRequest
from app.services.pin_service import PinService
from app.services.session_service import SessionService
from app.core.config import settings

router = APIRouter()


@router.post("/validate", status_code=status.HTTP_200_OK)
def validate_pin(
    payload: PinValidateRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Validate customer 4 or 5 digit PIN and establish an authorized scanning session.
    Sets secure HttpOnly cookie and returns session metadata.
    """
    client_ip = get_client_ip(request)
    pin = PinService.validate_and_claim_pin(db, pin=payload.pin, client_ip=client_ip)

    # Create new scanning session
    session = SessionService.create_session_for_pin(
        db=db,
        pin=pin,
        card_type="single",
        client_ip=client_ip,
    )

    # Set secure session cookie (scheme-aware so cookies are never dropped on HTTP/IP access)
    is_secure = settings.COOKIE_SECURE and (
        request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    )
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session.session_token,
        httponly=True,
        secure=is_secure,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.SESSION_EXPIRY_MINUTES * 60,
        path="/",
    )

    remaining = None
    if pin.max_completed_scans is not None:
        remaining = max(0, pin.max_completed_scans - pin.completed_scans)

    return {
        "success": True,
        "session_id": session.id,
        "session_token": session.session_token,  # Also return for dev clients/headers
        "card_type": session.card_type,
        "status": session.status,
        "expires_at": session.expires_at.isoformat(),
        "pin_label": pin.label,
        "remaining_scans": remaining,
        "redirect_url": "/scan",
    }
