from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.user import User
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogResponse, AuditLogListResponse

router = APIRouter()


@router.get("/audit-logs", response_model=AuditLogListResponse)
def get_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action name"),
    actor_type: Optional[str] = Query(None, description="Filter by actor type (admin, customer, system)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Retrieve system audit logs for administrative accountability."""
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor_type:
        q = q.filter(AuditLog.actor_type == actor_type)

    total = q.count()
    logs = q.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size).all()

    return AuditLogListResponse(
        items=logs,
        total=total,
    )
