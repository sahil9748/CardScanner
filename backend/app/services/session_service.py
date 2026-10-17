import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.scan_session import ScanSession
from app.models.access_pin import AccessPin
from app.models.gift_card_image import GiftCardImage
from app.core.security import generate_session_token
from app.core.config import settings
from app.storage.factory import get_storage
from app.vision.validator import validate_image_upload, create_thumbnail
from app.vision.cropper import auto_crop_card
from app.services.audit_service import record_audit_log


class SessionService:

    @staticmethod
    def create_session_for_pin(
        db: Session,
        pin: AccessPin,
        card_type: str = "single",
        client_ip: Optional[str] = None,
    ) -> ScanSession:
        """Create new scan session for validated PIN."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        expires_at = now + timedelta(minutes=settings.SESSION_EXPIRY_MINUTES)
        token = generate_session_token()

        back_status = "not_applicable" if card_type == "single" else "pending"

        session = ScanSession(
            access_pin_id=pin.id,
            card_type=card_type,
            status="initiated",
            front_capture_status="pending",
            back_capture_status=back_status,
            session_token=token,
            ip_address=client_ip,
            created_at=now,
            updated_at=now,
            expires_at=expires_at,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        record_audit_log(
            db=db,
            actor_type="customer",
            actor_id=client_ip,
            action="SESSION_CREATED",
            resource_type="scan_session",
            resource_id=session.id,
            ip_address=client_ip,
            metadata={"card_type": card_type, "pin_id": pin.id},
        )
        return session

    @staticmethod
    def get_by_token(db: Session, session_token: str) -> Optional[ScanSession]:
        """Lookup active session by its secure cookie token."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        session = db.query(ScanSession).filter(ScanSession.session_token == session_token).first()
        if not session:
            return None
        if session.expires_at < now and session.status not in ("completed", "incomplete"):
            session.status = "expired"
            db.commit()
        return session

    @staticmethod
    def update_card_type(db: Session, session: ScanSession, new_card_type: str) -> ScanSession:
        """Update card type between single and double if scan has not yet completed."""
        if session.status in ("completed", "incomplete"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change card type on completed or closed session.",
            )

        session.card_type = new_card_type
        if new_card_type == "double":
            if session.back_capture_status == "not_applicable":
                session.back_capture_status = "pending"
        else:
            session.back_capture_status = "not_applicable"

        session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def store_session_image(
        db: Session,
        session: ScanSession,
        side: str,  # "front" or "back"
        original_bytes: bytes,
        processed_bytes: bytes,
    ) -> GiftCardImage:
        """
        Validate, store, and link original and processed card images for a session.
        Permits safe retakes (overwriting the previous image for that side).
        """
        if session.status in ("completed", "expired", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot upload image to session in '{session.status}' state.",
            )

        if side not in ("front", "back"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Side must be 'front' or 'back'")

        if side == "back" and session.card_type != "double":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Back image only permitted for two-sided cards")

        # 1. Run server-side auto-cropping & rectification on original image
        try:
            server_cropped = auto_crop_card(original_bytes)
            if server_cropped and len(server_cropped) > 200:
                processed_bytes = server_cropped
        except Exception as e:
            # Fallback to provided client cropped bytes if OpenCV encountered an issue
            pass

        orig_meta = validate_image_upload(original_bytes)
        proc_meta = validate_image_upload(processed_bytes)

        # 2. Store files in private storage
        storage = get_storage()
        img_id = str(uuid.uuid4())
        orig_key = f"sessions/{session.id}/{side}_original_{img_id}.jpg"
        proc_key = f"sessions/{session.id}/{side}_processed_{img_id}.jpg"
        thumb_key = f"sessions/{session.id}/{side}_thumb_{img_id}.jpg"

        storage.save_image(original_bytes, orig_key, orig_meta["mime_type"])
        storage.save_image(processed_bytes, proc_key, proc_meta["mime_type"])

        # Also store thumbnail for fast dashboard / review loading
        thumb_bytes = create_thumbnail(processed_bytes)
        storage.save_image(thumb_bytes, thumb_key, "image/jpeg")

        # 3. Check for existing image record for this side in the session (Retake case)
        existing_img = (
            db.query(GiftCardImage)
            .filter(GiftCardImage.scan_session_id == session.id, GiftCardImage.side == side)
            .first()
        )

        if existing_img:
            # Delete old storage files safely
            try:
                storage.delete_image(existing_img.original_image_key)
                storage.delete_image(existing_img.processed_image_key)
            except Exception:
                pass  # Non-fatal if old file cleanup encounters minor issue

            existing_img.original_image_key = orig_key
            existing_img.processed_image_key = proc_key
            existing_img.original_width = orig_meta["width"]
            existing_img.original_height = orig_meta["height"]
            existing_img.processed_width = proc_meta["width"]
            existing_img.processed_height = proc_meta["height"]
            existing_img.mime_type = proc_meta["mime_type"]
            existing_img.file_size = proc_meta["file_size"]
            existing_img.created_at = datetime.now(timezone.utc).replace(tzinfo=None)
            image_record = existing_img
        else:
            image_record = GiftCardImage(
                scan_session_id=session.id,
                side=side,
                original_image_key=orig_key,
                processed_image_key=proc_key,
                original_width=orig_meta["width"],
                original_height=orig_meta["height"],
                processed_width=proc_meta["width"],
                processed_height=proc_meta["height"],
                mime_type=proc_meta["mime_type"],
                file_size=proc_meta["file_size"],
            )
            db.add(image_record)

        # 4. Update session status
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if side == "front":
            session.front_capture_status = "captured"
            if session.card_type == "double" and session.back_capture_status != "captured":
                session.status = "awaiting_back"
            else:
                session.status = "processing"
        elif side == "back":
            session.back_capture_status = "captured"
            session.status = "processing"

        session.updated_at = now
        db.commit()
        db.refresh(image_record)
        db.refresh(session)

        record_audit_log(
            db=db,
            actor_type="customer",
            action=f"IMAGE_UPLOADED_{side.upper()}",
            resource_type="scan_session",
            resource_id=session.id,
            metadata={"side": side, "width": proc_meta["width"], "height": proc_meta["height"]},
        )
        return image_record

    @staticmethod
    def retake_side(db: Session, session: ScanSession, side: str) -> ScanSession:
        """Reset capture state for one side without discarding the other side."""
        if side not in ("front", "back"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Side must be 'front' or 'back'")

        if side == "front":
            session.front_capture_status = "retake"
            session.status = "scanning_front"
        elif side == "back":
            if session.card_type != "double":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Card is not two-sided")
            session.back_capture_status = "retake"
            session.status = "scanning_back"

        session.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(session)
        return session
