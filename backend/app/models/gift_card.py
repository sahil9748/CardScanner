from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.db.base import Base, generate_uuid, utc_now


class GiftCard(Base):
    __tablename__ = "gift_cards"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    reference_code = Column(String(32), unique=True, nullable=False, index=True)
    scan_session_id = Column(String(36), ForeignKey("scan_sessions.id", ondelete="SET NULL"), unique=True, nullable=True, index=True)
    access_pin_id = Column(String(36), ForeignKey("access_pins.id", ondelete="SET NULL"), nullable=True, index=True)
    card_type = Column(String(20), nullable=False, default="single")  # single, double
    status = Column(String(50), nullable=False, default="completed", index=True)  # completed, flagged, archived

    brand = Column(String(100), nullable=True, index=True)
    denomination = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False, index=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    archived_at = Column(DateTime, nullable=True)

    # Relationships
    scan_session = relationship("ScanSession", back_populates="gift_card")
    access_pin = relationship("AccessPin", backref="gift_cards")
    images = relationship("GiftCardImage", back_populates="gift_card", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<GiftCard {self.reference_code} type={self.card_type} status={self.status}>"
