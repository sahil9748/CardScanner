from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.db.base import Base, generate_uuid, utc_now


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    access_pin_id = Column(String(36), ForeignKey("access_pins.id", ondelete="RESTRICT"), nullable=False, index=True)
    card_type = Column(String(20), nullable=False, default="single")  # single, double
    status = Column(String(50), nullable=False, default="initiated", index=True)
    # initiated, scanning_front, awaiting_back, scanning_back, processing, completed, incomplete, failed, cancelled, expired

    front_capture_status = Column(String(50), nullable=False, default="pending")  # pending, captured, failed, retake
    back_capture_status = Column(String(50), nullable=False, default="not_applicable")  # not_applicable, pending, captured, failed, retake

    session_token = Column(String(64), unique=True, nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    access_pin = relationship("AccessPin", backref="sessions")
    gift_card = relationship("GiftCard", back_populates="scan_session", uselist=False)
    images = relationship("GiftCardImage", back_populates="scan_session", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ScanSession {self.id} type={self.card_type} status={self.status}>"
