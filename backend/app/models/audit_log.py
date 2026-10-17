from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Index
from app.db.base import Base, generate_uuid, utc_now


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    actor_type = Column(String(50), nullable=False, index=True)  # "customer", "admin", "system"
    actor_id = Column(String(255), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=False, index=True)
    resource_id = Column(String(255), nullable=True, index=True)

    timestamp = Column(DateTime, default=utc_now, nullable=False, index=True)
    request_id = Column(String(64), nullable=True)
    ip_address = Column(String(45), nullable=True)
    sanitized_metadata = Column(Text, nullable=True)  # JSON-encoded sanitized metadata

    def __repr__(self):
        return f"<AuditLog {self.action} on {self.resource_type}:{self.resource_id} by {self.actor_type}:{self.actor_id}>"
