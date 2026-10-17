import json
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.db.base import utc_now


def record_audit_log(
    db: Session,
    actor_type: str,
    action: str,
    resource_type: str,
    actor_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    request_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """Record a security or system event in the audit log with sanitized metadata."""
    sanitized = None
    if metadata:
        # Guarantee no plaintext PINs, passwords, or image buffers are stored in logs
        safe_meta = {
            k: v for k, v in metadata.items()
            if not any(secret in k.lower() for secret in ["pin", "password", "token", "secret", "image_bytes", "data"])
        }
        sanitized = json.dumps(safe_meta)

    log_entry = AuditLog(
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        timestamp=utc_now(),
        request_id=request_id,
        ip_address=ip_address,
        sanitized_metadata=sanitized,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
