from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.user import User
from app.core.security import get_password_hash
from app.schemas.user import UserCreateRequest, UserUpdateRequest, UserItemResponse, UserListResponse
from app.services.audit_service import record_audit_log

router = APIRouter()


@router.get("/users", response_model=UserListResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List system users (Admin only)."""
    q = db.query(User)
    total = q.count()
    users = q.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    return UserListResponse(
        items=[UserItemResponse.model_validate(u) for u in users],
        total=total,
    )


@router.post("/users", response_model=UserItemResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new user account with employee or admin role (Admin only).
    Employees can generate PINs and check gift cards, but cannot delete records or manage users.
    """
    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{email_clean}' already exists.",
        )

    hashed = get_password_hash(payload.password)
    user = User(
        email=email_clean,
        password_hash=hashed,
        role=payload.role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    record_audit_log(
        db=db,
        actor_type="admin",
        actor_id=current_admin.email,
        action="USER_CREATED",
        resource_type="user",
        resource_id=user.id,
        metadata={"email": user.email, "role": user.role},
    )

    return UserItemResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserItemResponse)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update user status, role, or password (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        # Prevent demoting the last active admin
        if user.id == current_admin.id and payload.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own admin role.",
            )
        user.role = payload.role

    if payload.status is not None:
        if user.id == current_admin.id and payload.status == "disabled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot disable your own administrator account.",
            )
        user.status = payload.status

    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    db.commit()
    db.refresh(user)

    record_audit_log(
        db=db,
        actor_type="admin",
        actor_id=current_admin.email,
        action="USER_UPDATED",
        resource_type="user",
        resource_id=user.id,
        metadata={"role": user.role, "status": user.status},
    )

    return UserItemResponse.model_validate(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a user account (Admin only). Self-deletion is prohibited."""
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own administrator account.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    email = user.email
    db.delete(user)
    db.commit()

    record_audit_log(
        db=db,
        actor_type="admin",
        actor_id=current_admin.email,
        action="USER_DELETED",
        resource_type="user",
        resource_id=user_id,
        metadata={"email": email},
    )

    return {"success": True, "message": f"User '{email}' deleted successfully"}
