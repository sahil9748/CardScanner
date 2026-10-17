from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.core.security import verify_password
from app.core.rate_limit import admin_rate_limiter
from app.core.config import settings
from app.api.deps import get_client_ip, get_current_admin
from app.schemas.auth import AdminLoginRequest, AdminUserResponse
from app.services.audit_service import record_audit_log

router = APIRouter()


@router.post("/login", status_code=status.HTTP_200_OK)
def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Authenticate administrator with email and password.
    Enforces IP rate limiting and sets secure HttpOnly cookie.
    """
    client_ip = get_client_ip(request)

    # Check rate limiter
    admin_rate_limiter.check_allowed(
        key=client_ip,
        max_failed=settings.ADMIN_LOGIN_MAX_FAILED,
        lockout_seconds=settings.ADMIN_LOGIN_LOCKOUT_SECONDS,
    )

    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()

    if not user or not verify_password(payload.password, user.password_hash) or user.status != "active":
        admin_rate_limiter.record_failure(
            key=client_ip,
            max_failed=settings.ADMIN_LOGIN_MAX_FAILED,
            lockout_seconds=settings.ADMIN_LOGIN_LOCKOUT_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Success: clear limiter
    admin_rate_limiter.record_success(client_ip)

    # Update last login
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()

    # Set admin session cookie (scheme-aware so cookies are never dropped on HTTP/IP access)
    is_secure = settings.COOKIE_SECURE and (
        request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    )
    response.set_cookie(
        key=settings.ADMIN_COOKIE_NAME,
        value=user.id,
        httponly=True,
        secure=is_secure,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.ADMIN_SESSION_EXPIRY_HOURS * 3600,
        path="/",
    )

    record_audit_log(
        db=db,
        actor_type="admin",
        actor_id=user.email,
        action="ADMIN_LOGIN",
        resource_type="user",
        resource_id=user.id,
        ip_address=client_ip,
    )

    return {
        "success": True,
        "token": user.id,  # Provided for test clients & Authorization headers
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
        },
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
def admin_logout(
    response: Response,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Log out administrator and clear cookie."""
    response.delete_cookie(key=settings.ADMIN_COOKIE_NAME, path="/")
    record_audit_log(
        db=db,
        actor_type="admin",
        actor_id=current_admin.email,
        action="ADMIN_LOGOUT",
        resource_type="user",
        resource_id=current_admin.id,
    )
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me", response_model=AdminUserResponse)
def get_current_admin_profile(
    current_admin: User = Depends(get_current_admin),
):
    """Get currently logged-in administrator's profile."""
    return current_admin
