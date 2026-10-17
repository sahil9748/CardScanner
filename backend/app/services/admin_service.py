from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from fastapi import HTTPException, status
from app.models.gift_card import GiftCard
from app.models.gift_card_image import GiftCardImage
from app.models.scan_session import ScanSession
from app.models.access_pin import AccessPin
from app.models.audit_log import AuditLog
from app.storage.factory import get_storage
from app.services.audit_service import record_audit_log


class AdminService:

    @staticmethod
    def get_dashboard_metrics(db: Session) -> Dict[str, Any]:
        """Aggregate live dashboard statistics directly from database queries."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        today_start = datetime(now.year, now.month, now.day)

        total_cards = db.query(func.count(GiftCard.id)).scalar() or 0
        completed_scans = db.query(func.count(ScanSession.id)).filter(ScanSession.status == "completed").scalar() or 0
        incomplete_scans = db.query(func.count(ScanSession.id)).filter(
            ScanSession.status.in_(["incomplete", "failed", "cancelled", "expired"])
        ).scalar() or 0
        scans_today = db.query(func.count(ScanSession.id)).filter(ScanSession.created_at >= today_start).scalar() or 0
        active_pins = db.query(func.count(AccessPin.id)).filter(AccessPin.status == "active").scalar() or 0

        # Recent cards
        recent_cards = (
            db.query(GiftCard)
            .order_by(desc(GiftCard.created_at))
            .limit(5)
            .all()
        )

        # Recent audit logs
        recent_activity = (
            db.query(AuditLog)
            .order_by(desc(AuditLog.timestamp))
            .limit(10)
            .all()
        )

        return {
            "total_cards": total_cards,
            "completed_scans": completed_scans,
            "incomplete_scans": incomplete_scans,
            "scans_today": scans_today,
            "active_pins": active_pins,
            "recent_cards": [
                {
                    "id": c.id,
                    "reference_code": c.reference_code,
                    "card_type": c.card_type,
                    "status": c.status,
                    "brand": c.brand,
                    "created_at": c.created_at.isoformat(),
                }
                for c in recent_cards
            ],
            "recent_activity": [
                {
                    "id": a.id,
                    "action": a.action,
                    "actor_type": a.actor_type,
                    "actor_id": a.actor_id,
                    "resource_type": a.resource_type,
                    "timestamp": a.timestamp.isoformat(),
                }
                for a in recent_activity
            ],
        }

    @staticmethod
    def search_cards(
        db: Session,
        query: Optional[str] = None,
        card_type: Optional[str] = None,
        status_filter: Optional[str] = None,
        pin_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 15,
    ) -> Tuple[List[GiftCard], int]:
        """Search and filter cards with pagination."""
        q = db.query(GiftCard)

        if query:
            search_term = f"%{query.strip()}%"
            q = q.filter(
                or_(
                    GiftCard.reference_code.ilike(search_term),
                    GiftCard.brand.ilike(search_term),
                    GiftCard.notes.ilike(search_term),
                )
            )

        if card_type:
            q = q.filter(GiftCard.card_type == card_type)

        if status_filter:
            q = q.filter(GiftCard.status == status_filter)

        if pin_id:
            q = q.filter(GiftCard.access_pin_id == pin_id)

        total = q.count()
        cards = q.order_by(desc(GiftCard.created_at)).offset((page - 1) * page_size).limit(page_size).all()
        return cards, total

    @staticmethod
    def update_card(
        db: Session,
        card_id: str,
        brand: Optional[str] = None,
        denomination: Optional[str] = None,
        notes: Optional[str] = None,
        status: Optional[str] = None,
        admin_email: Optional[str] = None,
    ) -> GiftCard:
        """Update gift card metadata and notes."""
        card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")

        if brand is not None:
            card.brand = brand
        if denomination is not None:
            card.denomination = denomination
        if notes is not None:
            card.notes = notes
        if status is not None:
            card.status = status

        card.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(card)

        record_audit_log(
            db=db,
            actor_type="admin",
            actor_id=admin_email,
            action="CARD_UPDATED",
            resource_type="gift_card",
            resource_id=card.id,
            metadata={"status": card.status, "brand": card.brand},
        )
        return card

    @staticmethod
    def archive_card(db: Session, card_id: str, admin_email: Optional[str] = None) -> GiftCard:
        """Archive a gift card record."""
        card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")

        card.status = "archived"
        card.archived_at = datetime.now(timezone.utc).replace(tzinfo=None)
        card.updated_at = card.archived_at
        db.commit()
        db.refresh(card)

        record_audit_log(
            db=db,
            actor_type="admin",
            actor_id=admin_email,
            action="CARD_ARCHIVED",
            resource_type="gift_card",
            resource_id=card.id,
        )
        return card

    @staticmethod
    def delete_card(db: Session, card_id: str, admin_email: Optional[str] = None) -> bool:
        """Permanently delete a gift card and remove images from storage."""
        card = db.query(GiftCard).filter(GiftCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")

        storage = get_storage()
        for img in card.images:
            try:
                storage.delete_image(img.original_image_key)
                storage.delete_image(img.processed_image_key)
            except Exception:
                pass

        ref_code = card.reference_code
        db.delete(card)
        db.commit()

        record_audit_log(
            db=db,
            actor_type="admin",
            actor_id=admin_email,
            action="CARD_DELETED",
            resource_type="gift_card",
            resource_id=card_id,
            metadata={"reference_code": ref_code},
        )
        return True
