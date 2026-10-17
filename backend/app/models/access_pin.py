from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Index, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base, generate_uuid, utc_now


class AccessPin(Base):
    __tablename__ = "access_pins"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    pin_hmac = Column(String(64), unique=True, nullable=False, index=True)
    pin_length = Column(Integer, nullable=False, default=4)
    label = Column(String(255), nullable=True)
    card_type = Column(String(20), nullable=False, default="single")
    status = Column(String(50), nullable=False, default="active", index=True)  # active, expired, revoked, exhausted
    max_completed_scans = Column(Integer, nullable=True)  # None = unlimited
    completed_scans = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=True, index=True)
    webhook_url = Column(String(500), nullable=True)
    redirect_url = Column(String(500), nullable=True)
    api_key_id = Column(String(36), ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    # Relationships
    api_key = relationship("ApiKey", backref="pins")

    def is_valid_and_usable(self, now: datetime) -> bool:
        if self.status != "active":
            return False
        if self.expires_at and now > self.expires_at:
            return False
        if self.max_completed_scans is not None and self.completed_scans >= self.max_completed_scans:
            return False
        return True

    def __repr__(self):
        return f"<AccessPin id={self.id} len={self.pin_length} status={self.status} scans={self.completed_scans}/{self.max_completed_scans}>"
