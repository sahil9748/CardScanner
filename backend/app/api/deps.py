from typing import Optional
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.scan_session import ScanSession
from app.core.config import settings
from app.services.session_service import SessionService


def get_client_ip(request: Request) -> str:
    """Extract client IP handling proxies / load balancers."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def get_current_customer_session(
    request: Request,
    db: Session = Depends(get_db),
) -> ScanSession:
    """
    Authenticate customer from HttpOnly cookie.
    Ensures customer requests are scoped exclusively to their own active session.
    """
    token = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if not token:
        token = request.cookies.get(settings.SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid scanning session required. Please enter an access PIN.",
        )

    session = SessionService.get_by_token(db, token)
    if not session or session.status in ("expired", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Scanning session has expired or is invalid. Please enter your PIN again.",
        )

    return session


def get_current_staff_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Authenticate staff user (either admin or employee) from Authorization header or session cookie.
    Both admin and employee can view cards, generate access codes, view dashboard, and download images.
    """
    user_id = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        user_id = auth_header.split(" ")[1]

    if not user_id:
        user_id = request.cookies.get(settings.ADMIN_COOKIE_NAME)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status != "active" or user.role not in ("admin", "employee"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden. Active employee or admin account required.",
        )

    return user


def get_current_admin(
    request: Request,
    db: Session = Depends(get_db),
    current_staff: User = Depends(get_current_staff_user),
) -> User:
    """
    Enforces that the current authenticated staff user has the 'admin' role.
    Employees attempting actions like card deletion or user management will receive 403 Forbidden.
    """
    if current_staff.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required. Employees are not permitted to perform this action.",
        )

    return current_staff


def get_api_key_auth(
    request: Request,
    db: Session = Depends(get_db),
) -> "ApiKey":
    """
    Authenticate third-party integrations using an API key.
    Checks:
    1. Header 'X-API-Key'
    2. Header 'Authorization: Bearer <sk_live_...>'
    3. Query parameter '?api_key=...' (for direct <img src="..." /> previews)
    """
    from app.services.api_key_service import ApiKeyService

    api_key_raw = request.headers.get("x-api-key")
    if not api_key_raw:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            api_key_raw = auth_header.split(" ", 1)[1].strip()

    if not api_key_raw:
        api_key_raw = request.query_params.get("api_key")

    if not api_key_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key required. Provide via 'X-API-Key' header, 'Bearer' token, or '?api_key=' parameter.",
        )

    key_model = ApiKeyService.authenticate_key(db, api_key_raw)
    if not key_model:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key.",
        )

    return key_model

