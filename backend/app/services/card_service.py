from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.scan_session import ScanSession
from app.models.access_pin import AccessPin
from app.models.gift_card import GiftCard
from app.models.gift_card_image import GiftCardImage
from app.core.security import generate_card_reference
from app.services.audit_service import record_audit_log


class CardService:

    @staticmethod
    def complete_scan_session(
        db: Session,
        session: ScanSession,
    ) -> GiftCard:
        """
        Complete a scan session transactionally:
        1. Validates required images exist for the card_type.
           - Single-sided: requires front image.
           - Two-sided: requires BOTH front and back images!
        2. Locks AccessPin and checks remaining allowance.
        3. Creates GiftCard record with unique reference code.
        4. Associates image records with the new GiftCard.
        5. Increments PIN completed_scans.
        6. Updates session status to 'completed'.
        """
        # Idempotency check: if session is already completed, return existing card
        if session.status == "completed" and session.gift_card:
            return session.gift_card

        if session.status in ("expired", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete session in '{session.status}' state",
            )

        # 1. Image requirements validation
        images = db.query(GiftCardImage).filter(GiftCardImage.scan_session_id == session.id).all()
        has_front = any(img.side == "front" for img in images)
        has_back = any(img.side == "back" for img in images)

        if not has_front:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Front image is required to complete card scan.",
            )

        if session.card_type == "double" and not has_back:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Two-sided card requires both front and back images before completion.",
            )

        # 2. Access PIN allowance check with row-level locking
        # Using with_for_update() ensures concurrent requests on the same PIN cannot exceed max_scans
        pin = (
            db.query(AccessPin)
            .filter(AccessPin.id == session.access_pin_id)
            .with_for_update()
            .first()
        )
        if not pin:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated access PIN not found")

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if pin.status != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access PIN is no longer active")

        if pin.expires_at and pin.expires_at < now:
            pin.status = "expired"
            db.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access PIN has expired")

        if pin.max_completed_scans is not None:
            if pin.completed_scans >= pin.max_completed_scans:
                pin.status = "exhausted"
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access PIN scan allowance has been exhausted",
                )

        # 3. Create GiftCard record
        ref_code = generate_card_reference()
        # Verify reference code uniqueness
        while db.query(GiftCard).filter(GiftCard.reference_code == ref_code).first():
            ref_code = generate_card_reference()

        card = GiftCard(
            reference_code=ref_code,
            scan_session_id=session.id,
            access_pin_id=pin.id,
            card_type=session.card_type,
            status="completed",
            created_at=now,
            updated_at=now,
        )
        db.add(card)
        db.flush()  # Generates card.id

        # 4. Associate images to GiftCard
        for img in images:
            img.gift_card_id = card.id

        # 5. Atomically increment PIN completed_scans
        pin.completed_scans += 1
        if pin.max_completed_scans is not None and pin.completed_scans >= pin.max_completed_scans:
            pin.status = "exhausted"

        # 6. Mark session completed
        session.status = "completed"
        session.completed_at = now
        session.updated_at = now

        db.commit()
        db.refresh(card)
        db.refresh(session)
        db.refresh(pin)

        record_audit_log(
            db=db,
            actor_type="customer",
            action="CARD_COMPLETED",
            resource_type="gift_card",
            resource_id=card.id,
            metadata={
                "reference_code": card.reference_code,
                "card_type": card.card_type,
                "pin_id": pin.id,
            },
        )
        return card

    @staticmethod
    def mark_session_incomplete(db: Session, session: ScanSession) -> ScanSession:
        """Mark session incomplete if customer leaves before completing required captures."""
        if session.status != "completed":
            session.status = "incomplete"
            session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db.commit()
            db.refresh(session)
        return session
