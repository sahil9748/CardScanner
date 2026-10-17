from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base, generate_uuid, utc_now


class GiftCardImage(Base):
    __tablename__ = "gift_card_images"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    gift_card_id = Column(String(36), ForeignKey("gift_cards.id", ondelete="CASCADE"), nullable=True, index=True)
    scan_session_id = Column(String(36), ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    side = Column(String(10), nullable=False)  # "front" or "back"

    original_image_key = Column(String(500), nullable=False)
    processed_image_key = Column(String(500), nullable=False)

    original_width = Column(Integer, nullable=False, default=0)
    original_height = Column(Integer, nullable=False, default=0)
    processed_width = Column(Integer, nullable=False, default=0)
    processed_height = Column(Integer, nullable=False, default=0)

    mime_type = Column(String(50), nullable=False, default="image/jpeg")
    file_size = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # Relationships
    gift_card = relationship("GiftCard", back_populates="images")
    scan_session = relationship("ScanSession", back_populates="images")

    __table_args__ = (
        # Ensure only 1 image record per side per session
        UniqueConstraint("scan_session_id", "side", name="uq_session_side_image"),
    )

    def __repr__(self):
        return f"<GiftCardImage id={self.id} side={self.side} card={self.gift_card_id}>"
