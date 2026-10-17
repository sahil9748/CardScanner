import hmac
import hashlib
import secrets
import bcrypt
from typing import Optional
from app.core.config import settings


def get_password_hash(password: str) -> str:
    """Hash password using native bcrypt."""
    pw_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pw_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        pw_bytes = plain_password.encode("utf-8")
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False


def compute_pin_hmac(pin: str) -> str:
    """
    Compute a keyed HMAC-SHA256 for a numeric PIN.
    Using a server-side secret key ensures that even with a low-entropy
    4 or 5 digit space, an offline brute-force attacker with a DB dump
    cannot reverse or guess PINs without knowing the server HMAC secret.
    """
    pin_clean = str(pin).strip()
    return hmac.new(
        settings.PIN_HMAC_SECRET.encode("utf-8"),
        pin_clean.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def verify_pin_hmac(provided_pin: str, stored_hmac: str) -> bool:
    """Constant-time verification of PIN HMAC."""
    computed = compute_pin_hmac(provided_pin)
    return hmac.compare_digest(computed, stored_hmac)


def generate_secure_pin(length: int = 4) -> str:
    """
    Generate a cryptographically secure numeric PIN preserving leading zeros.
    Example: length=4 can generate '0047'.
    """
    if length not in (4, 5):
        raise ValueError("PIN length must be 4 or 5 digits")
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def generate_session_token() -> str:
    """Generate high-entropy session token for secure cookies."""
    return secrets.token_urlsafe(32)


def generate_card_reference() -> str:
    """Generate unique human-readable card reference (e.g. CARD-8B29FA)."""
    random_hex = secrets.token_hex(3).upper()
    return f"CARD-{random_hex}"
