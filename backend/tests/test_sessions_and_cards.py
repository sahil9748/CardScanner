import io
import pytest
from app.services.pin_service import PinService
from app.models.access_pin import AccessPin
from app.models.gift_card import GiftCard


def test_single_sided_card_completion(client, db_session, test_image_bytes):
    # 1. Create PIN with max 1 scan
    pin_model, plain = PinService.generate_single_pin(db_session, pin_length=4, max_completed_scans=1)

    # 2. Validate PIN
    val_resp = client.post("/api/v1/access-pins/validate", json={"pin": plain})
    assert val_resp.status_code == 200
    session_id = val_resp.json()["session_id"]
    token = val_resp.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Upload front image
    files = {
        "original_file": ("front_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    upload_resp = client.post(f"/api/v1/sessions/{session_id}/images/front", files=files, headers=headers)
    assert upload_resp.status_code == 200
    assert upload_resp.json()["front_status"] == "captured"

    # 4. Complete session
    comp_resp = client.post(f"/api/v1/sessions/{session_id}/complete", headers=headers)
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["success"] is True
    assert "CARD-" in comp_data["reference_code"]

    # 5. Check PIN exhausted
    db_session.refresh(pin_model)
    assert pin_model.completed_scans == 1
    assert pin_model.status == "exhausted"


def test_double_sided_rejection_when_missing_back(client, db_session, test_image_bytes):
    # 1. Create PIN
    pin_model, plain = PinService.generate_single_pin(db_session, pin_length=4, max_completed_scans=2)

    # 2. Validate PIN
    val_resp = client.post("/api/v1/access-pins/validate", json={"pin": plain})
    session_id = val_resp.json()["session_id"]
    token = val_resp.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Set card type to 'double'
    type_resp = client.post("/api/v1/sessions/card-type", json={"card_type": "double"}, headers=headers)
    assert type_resp.status_code == 200
    assert type_resp.json()["card_type"] == "double"

    # 4. Upload ONLY front image
    files = {
        "original_file": ("front_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    client.post(f"/api/v1/sessions/{session_id}/images/front", files=files, headers=headers)

    # 5. Attempt complete without back image -> MUST FAIL with 400
    comp_fail = client.post(f"/api/v1/sessions/{session_id}/complete", headers=headers)
    assert comp_fail.status_code == 400
    assert "Two-sided card requires both front and back images" in comp_fail.json()["detail"]

    # 6. Upload back image
    files_back = {
        "original_file": ("back_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("back_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    upload_back = client.post(f"/api/v1/sessions/{session_id}/images/back", files=files_back, headers=headers)
    assert upload_back.status_code == 200
    assert upload_back.json()["back_status"] == "captured"

    # 7. Complete session now succeeds!
    comp_ok = client.post(f"/api/v1/sessions/{session_id}/complete", headers=headers)
    assert comp_ok.status_code == 200

    # Verify that a two-sided scan consumed only 1 scan allowance, not 2!
    db_session.refresh(pin_model)
    assert pin_model.completed_scans == 1


def test_independent_retake_does_not_consume_extra_allowance(client, db_session, test_image_bytes):
    pin_model, plain = PinService.generate_single_pin(db_session, pin_length=4, max_completed_scans=2)
    val_resp = client.post("/api/v1/access-pins/validate", json={"pin": plain})
    session_id = val_resp.json()["session_id"]
    token = val_resp.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload front
    files1 = {
        "original_file": ("front_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    client.post(f"/api/v1/sessions/{session_id}/images/front", files=files1, headers=headers)

    # Retake front
    retake_resp = client.post(f"/api/v1/sessions/{session_id}/retake/front", headers=headers)
    assert retake_resp.status_code == 200
    assert retake_resp.json()["front_capture_status"] == "retake"

    # Re-upload front
    files2 = {
        "original_file": ("front_orig_2.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc_2.jpg", test_image_bytes, "image/jpeg"),
    }
    client.post(f"/api/v1/sessions/{session_id}/images/front", files=files2, headers=headers)

    # Complete
    client.post(f"/api/v1/sessions/{session_id}/complete", headers=headers)

    # Allowance must only be 1
    db_session.refresh(pin_model)
    assert pin_model.completed_scans == 1
