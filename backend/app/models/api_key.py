from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime
from app.db.base import Base, generate_uuid, utc_now


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    key_prefix = Column(String(20), nullable=False, index=True)
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ApiKey id={self.id} name={self.name} prefix={self.key_prefix} active={self.is_active}>"
