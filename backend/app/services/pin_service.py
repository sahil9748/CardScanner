from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from fastapi import HTTPException, status
from app.models.access_pin import AccessPin
from app.core.security import compute_pin_hmac, generate_secure_pin
from app.core.rate_limit import pin_rate_limiter
from app.core.config import settings
from app.services.audit_service import record_audit_log


class PinService:

    @staticmethod
    def generate_single_pin(
        db: Session,
        pin_length: int = 4,
        label: Optional[str] = None,
        card_type: str = "single",
        max_completed_scans: Optional[int] = 1,
        expires_at: Optional[datetime] = None,
        created_by: Optional[str] = None,
        webhook_url: Optional[str] = None,
        redirect_url: Optional[str] = None,
        api_key_id: Optional[str] = None,
    ) -> Tuple[AccessPin, str]:
        """
        Generate a unique cryptographically secure PIN.
        Returns (AccessPin db model, plaintext_pin).
        The plaintext PIN is returned ONCE to show to the admin and never saved to DB.
        """
        max_attempts = 100
        for _ in range(max_attempts):
            plain_pin = generate_secure_pin(pin_length)
            hmac_val = compute_pin_hmac(plain_pin)

            # Check for existing active pin with this HMAC
            existing = db.query(AccessPin).filter(AccessPin.pin_hmac == hmac_val).first()
            if not existing:
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to generate unique PIN after multiple attempts",
            )

        pin_model = AccessPin(
            pin_hmac=hmac_val,
            pin_length=pin_length,
            label=label,
            card_type=card_type,
            status="active",
            max_completed_scans=max_completed_scans,
            completed_scans=0,
            expires_at=expires_at,
            webhook_url=webhook_url,
            redirect_url=redirect_url,
            api_key_id=api_key_id,
            created_by=created_by,
        )
        db.add(pin_model)
        db.commit()
        db.refresh(pin_model)

        record_audit_log(
            db=db,
            actor_type="admin",
            actor_id=created_by,
            action="PIN_GENERATED",
            resource_type="access_pin",
            resource_id=pin_model.id,
            metadata={"pin_length": pin_length, "label": label, "max_scans": max_completed_scans},
        )

        return pin_model, plain_pin

    @staticmethod
    def generate_batch_pins(
        db: Session,
        count: int,
        pin_length: int = 4,
        label_prefix: Optional[str] = None,
        max_completed_scans: Optional[int] = 1,
        expires_at: Optional[datetime] = None,
        created_by: Optional[str] = None,
    ) -> List[Tuple[AccessPin, str]]:
        """Batch generate multiple unique PINs."""
        created = []
        for i in range(count):
            label = f"{label_prefix or 'Batch'} #{i+1}" if label_prefix else f"Batch PIN #{i+1}"
            pin_model, plain_pin = PinService.generate_single_pin(
                db=db,
                pin_length=pin_length,
                label=label,
                max_completed_scans=max_completed_scans,
                expires_at=expires_at,
                created_by=created_by,
            )
            created.append((pin_model, plain_pin))
        return created

    @staticmethod
    def validate_and_claim_pin(
        db: Session,
        pin: str,
        client_ip: str,
    ) -> AccessPin:
        """
        Validate a customer-entered PIN.
        Applies IP-based rate limiting with progressive lockout.
        Does not leak information about whether a PIN exists or why it failed.
        """
        # 1. Check rate limiter
        pin_rate_limiter.check_allowed(
            key=client_ip,
            max_failed=settings.PIN_MAX_FAILED_ATTEMPTS,
            lockout_seconds=settings.PIN_LOCKOUT_SECONDS,
        )

        hmac_val = compute_pin_hmac(pin)
        pin_record = db.query(AccessPin).filter(AccessPin.pin_hmac == hmac_val).first()

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Invalid, expired, revoked, or exhausted check
        is_valid = (
            pin_record is not None
            and pin_record.status == "active"
            and (pin_record.expires_at is None or pin_record.expires_at > now)
            and (pin_record.max_completed_scans is None or pin_record.completed_scans < pin_record.max_completed_scans)
        )

        if not is_valid:
            remaining = pin_rate_limiter.record_failure(
                key=client_ip,
                max_failed=settings.PIN_MAX_FAILED_ATTEMPTS,
                lockout_seconds=settings.PIN_LOCKOUT_SECONDS,
            )
            # Generic error message to prevent enumeration or revealing whether PIN exists
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, expired, or exhausted access PIN.",
            )

        # Valid PIN: clear failed rate limiting record
        pin_rate_limiter.record_success(client_ip)

        record_audit_log(
            db=db,
            actor_type="customer",
            actor_id=client_ip,
            action="PIN_VALIDATED",
            resource_type="access_pin",
            resource_id=pin_record.id,
            ip_address=client_ip,
        )

        return pin_record

    @staticmethod
    def revoke_pin(db: Session, pin_id: str, admin_email: str) -> AccessPin:
        """Revoke a PIN immediately."""
        pin = db.query(AccessPin).filter(AccessPin.id == pin_id).first()
        if not pin:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PIN not found")

        pin.status = "revoked"
        pin.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        db.refresh(pin)

        record_audit_log(
            db=db,
            actor_type="admin",
            actor_id=admin_email,
            action="PIN_REVOKED",
            resource_type="access_pin",
            resource_id=pin.id,
        )
        return pin
