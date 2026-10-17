from datetime import datetime, timedelta, timezone
import pytest
from app.services.pin_service import PinService
from app.core.security import compute_pin_hmac
from app.models.access_pin import AccessPin


def test_generate_pin_length_4_and_5(db_session):
    pin4_model, plain4 = PinService.generate_single_pin(db_session, pin_length=4, label="4-digit")
    assert len(plain4) == 4
    assert plain4.isdigit()
    assert pin4_model.pin_length == 4

    pin5_model, plain5 = PinService.generate_single_pin(db_session, pin_length=5, label="5-digit")
    assert len(plain5) == 5
    assert plain5.isdigit()
    assert pin5_model.pin_length == 5


def test_pin_preserves_leading_zeros(db_session, client):
    # Explicitly test a PIN with leading zeros like "0047"
    raw_pin = "0047"
    hmac_val = compute_pin_hmac(raw_pin)
    pin_model = AccessPin(
        pin_hmac=hmac_val,
        pin_length=4,
        label="Leading Zero PIN",
        status="active",
        max_completed_scans=2,
    )
    db_session.add(pin_model)
    db_session.commit()

    # Customer enters "0047"
    response = client.post("/api/v1/access-pins/validate", json={"pin": "0047"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "session_id" in data
    assert "cardscan_session" in response.cookies


def test_reject_invalid_pins(client):
    response = client.post("/api/v1/access-pins/validate", json={"pin": "9999"})
    assert response.status_code == 401
    assert "Invalid, expired, or exhausted" in response.json()["detail"]


def test_reject_expired_pin(db_session, client):
    raw_pin = "1234"
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    pin_model = AccessPin(
        pin_hmac=compute_pin_hmac(raw_pin),
        pin_length=4,
        label="Expired PIN",
        status="active",
        expires_at=past,
    )
    db_session.add(pin_model)
    db_session.commit()

    response = client.post("/api/v1/access-pins/validate", json={"pin": "1234"})
    assert response.status_code == 401


def test_reject_revoked_pin(db_session, client):
    raw_pin = "5678"
    pin_model = AccessPin(
        pin_hmac=compute_pin_hmac(raw_pin),
        pin_length=4,
        label="Revoked PIN",
        status="revoked",
    )
    db_session.add(pin_model)
    db_session.commit()

    response = client.post("/api/v1/access-pins/validate", json={"pin": "5678"})
    assert response.status_code == 401


def test_reject_exhausted_pin(db_session, client):
    raw_pin = "7890"
    pin_model = AccessPin(
        pin_hmac=compute_pin_hmac(raw_pin),
        pin_length=4,
        label="Exhausted PIN",
        status="exhausted",
        max_completed_scans=1,
        completed_scans=1,
    )
    db_session.add(pin_model)
    db_session.commit()

    response = client.post("/api/v1/access-pins/validate", json={"pin": "7890"})
    assert response.status_code == 401


def test_rate_limiting_lockout(client):
    # Repeated failed attempts should trigger 429
    for i in range(5):
        resp = client.post("/api/v1/access-pins/validate", json={"pin": "0000"})
        assert resp.status_code == 401

    # 6th attempt should be locked out (429)
    resp_locked = client.post("/api/v1/access-pins/validate", json={"pin": "0000"})
    assert resp_locked.status_code == 429
    assert "Too many failed attempts" in resp_locked.json()["detail"]


def test_invalid_pin_format(client):
    # Length < 4
    resp = client.post("/api/v1/access-pins/validate", json={"pin": "123"})
    assert resp.status_code == 422

    # Length > 5
    resp = client.post("/api/v1/access-pins/validate", json={"pin": "123456"})
    assert resp.status_code == 422

    # Non-numeric
    resp = client.post("/api/v1/access-pins/validate", json={"pin": "12A4"})
    assert resp.status_code == 422
