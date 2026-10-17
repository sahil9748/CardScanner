import secrets
import hashlib
from typing import Tuple, Optional, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.api_key import ApiKey


class ApiKeyService:
    @staticmethod
    def hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()

    @classmethod
    def create_api_key(
        cls,
        db: Session,
        name: str,
        created_by: Optional[str] = None,
    ) -> Tuple[ApiKey, str]:
        """
        Generate a secure sk_live_... API key, store its SHA-256 hash,
        and return the model alongside the one-time plaintext key.
        """
        token = secrets.token_urlsafe(32)
        raw_key = f"sk_live_{token}"
        key_hash = cls.hash_key(raw_key)
        prefix = f"{raw_key[:12]}..."

        key_model = ApiKey(
            name=name.strip(),
            key_prefix=prefix,
            key_hash=key_hash,
            is_active=True,
            created_by=created_by,
        )
        db.add(key_model)
        db.commit()
        db.refresh(key_model)
        return key_model, raw_key

    @classmethod
    def authenticate_key(cls, db: Session, raw_key: str) -> Optional[ApiKey]:
        """
        Validate incoming API key by hash and update last_used_at timestamp.
        """
        if not raw_key:
            return None

        key_hash = cls.hash_key(raw_key)
        key_model = db.query(ApiKey).filter(ApiKey.key_hash == key_hash, ApiKey.is_active.is_(True)).first()
        if not key_model:
            return None

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        key_model.last_used_at = now
        db.commit()
        return key_model

    @staticmethod
    def revoke_key(db: Session, key_id: str) -> Optional[ApiKey]:
        key_model = db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if key_model:
            key_model.is_active = False
            db.commit()
            db.refresh(key_model)
        return key_model

    @staticmethod
    def list_keys(db: Session) -> List[ApiKey]:
        return db.query(ApiKey).order_by(desc(ApiKey.created_at)).all()
