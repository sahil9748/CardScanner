from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.user import User
from app.services.api_key_service import ApiKeyService
from app.schemas.integration import (
    ApiKeyCreateRequest,
    ApiKeyResponse,
    ApiKeyCreatedResponse,
)

router = APIRouter()


@router.get("/api-keys", response_model=List[ApiKeyResponse])
def list_api_keys(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all integration API keys (Administrator only)."""
    keys = ApiKeyService.list_keys(db)
    return [
        ApiKeyResponse(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            is_active=k.is_active,
            created_by=k.created_by,
            created_at=k.created_at.isoformat(),
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
        )
        for k in keys
    ]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: ApiKeyCreateRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Generate a new API key for third-party web application integration.
    The secret API key is returned ONLY once in this response.
    """
    key_model, raw_key = ApiKeyService.create_api_key(
        db=db,
        name=payload.name,
        created_by=current_admin.email,
    )
    return ApiKeyCreatedResponse(
        id=key_model.id,
        name=key_model.name,
        api_key=raw_key,
        key_prefix=key_model.key_prefix,
        created_at=key_model.created_at.isoformat(),
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_200_OK)
def revoke_api_key(
    key_id: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Revoke an API key immediately."""
    key = ApiKeyService.revoke_key(db, key_id)
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    return {"success": True, "message": f"API key '{key.name}' revoked successfully."}
