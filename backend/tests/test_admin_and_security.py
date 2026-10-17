import pytest
from app.services.pin_service import PinService
from app.models.gift_card import GiftCard


def test_customer_cannot_access_admin_endpoints(client):
    # Completely unauthenticated
    resp = client.get("/api/v1/admin/dashboard")
    assert resp.status_code in (401, 403)

    resp_cards = client.get("/api/v1/admin/cards")
    assert resp_cards.status_code in (401, 403)


def test_admin_login_and_access(client, admin_user):
    # Wrong password
    fail_resp = client.post("/api/v1/admin/auth/login", json={"email": admin_user.email, "password": "WrongPassword"})
    assert fail_resp.status_code == 401

    # Correct password
    login_resp = client.post("/api/v1/admin/auth/login", json={"email": admin_user.email, "password": "AdminTest123!"})
    assert login_resp.status_code == 200
    assert login_resp.json()["success"] is True
    assert "cardscan_admin_session" in login_resp.cookies

    admin_token = login_resp.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Now accessing admin dashboard succeeds
    dash_resp = client.get("/api/v1/admin/dashboard", headers=admin_headers)
    assert dash_resp.status_code == 200
    assert "metrics" in dash_resp.json()


def test_customer_session_isolation(client, db_session, test_image_bytes):
    # Customer 1
    _, pin1 = PinService.generate_single_pin(db_session, pin_length=4)
    s1_resp = client.post("/api/v1/access-pins/validate", json={"pin": pin1})
    s1_id = s1_resp.json()["session_id"]
    s1_token = s1_resp.json()["session_token"]

    # Customer 2
    _, pin2 = PinService.generate_single_pin(db_session, pin_length=4)
    s2_resp = client.post("/api/v1/access-pins/validate", json={"pin": pin2})
    s2_id = s2_resp.json()["session_id"]
    s2_token = s2_resp.json()["session_token"]

    # Customer 1 uploads to Customer 1 -> OK
    files = {
        "original_file": ("front_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    ok_upload = client.post(
        f"/api/v1/sessions/{s1_id}/images/front",
        files=files,
        headers={"Authorization": f"Bearer {s1_token}"},
    )
    assert ok_upload.status_code == 200

    # Customer 2 attempts to upload to Customer 1's session -> MUST BE BLOCKED (403)
    files2 = {
        "original_file": ("front_orig.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    blocked_upload = client.post(
        f"/api/v1/sessions/{s1_id}/images/front",
        files=files2,
        headers={"Authorization": f"Bearer {s2_token}"},
    )
    assert blocked_upload.status_code == 403

    # Customer 2 attempts to stream Customer 1's image -> MUST BE BLOCKED (403)
    blocked_stream = client.get(
        f"/api/v1/sessions/{s1_id}/images/front/processed",
        headers={"Authorization": f"Bearer {s2_token}"},
    )
    assert blocked_stream.status_code == 403


def test_employee_permissions_and_deletion_restriction(client, admin_user, db_session, test_image_bytes):
    admin_headers = {"Authorization": f"Bearer {admin_user.id}"}

    # 1. Admin creates an Employee user
    emp_create_resp = client.post(
        "/api/v1/admin/users",
        json={"email": "operator@cardscan.io", "password": "EmployeePassword123!", "role": "employee"},
        headers=admin_headers,
    )
    assert emp_create_resp.status_code == 201
    emp_data = emp_create_resp.json()
    assert emp_data["role"] == "employee"

    # 2. Employee logs in
    emp_login = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "operator@cardscan.io", "password": "EmployeePassword123!"},
    )
    assert emp_login.status_code == 200
    emp_token = emp_login.json()["token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # 3. Employee CAN view dashboard
    dash_resp = client.get("/api/v1/admin/dashboard", headers=emp_headers)
    assert dash_resp.status_code == 200

    # 4. Employee CAN generate new access PINs
    pin_resp = client.post(
        "/api/v1/admin/access-pins",
        json={"pin_length": 4, "label": "Employee Generated", "max_completed_scans": 1},
        headers=emp_headers,
    )
    assert pin_resp.status_code == 200
    generated_pin = pin_resp.json()["pin"]

    # 5. Customer scans a card with that PIN
    val_resp = client.post("/api/v1/access-pins/validate", json={"pin": generated_pin})
    cust_session_id = val_resp.json()["session_id"]
    cust_token = val_resp.json()["session_token"]

    files = {
        "original_file": ("front.jpg", test_image_bytes, "image/jpeg"),
        "processed_file": ("front_proc.jpg", test_image_bytes, "image/jpeg"),
    }
    client.post(
        f"/api/v1/sessions/{cust_session_id}/images/front",
        files=files,
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    comp_resp = client.post(f"/api/v1/sessions/{cust_session_id}/complete", headers={"Authorization": f"Bearer {cust_token}"})
    card_id = comp_resp.json()["gift_card_id"]

    # 6. Employee CAN check on the gift card received
    card_resp = client.get(f"/api/v1/admin/cards/{card_id}", headers=emp_headers)
    assert card_resp.status_code == 200
    assert card_resp.json()["id"] == card_id

    # 7. Employee CANNOT delete the gift card (STRICTLY FORBIDDEN with 403)
    emp_delete_resp = client.delete(f"/api/v1/admin/cards/{card_id}", headers=emp_headers)
    assert emp_delete_resp.status_code == 403
    assert "Employees are not permitted" in emp_delete_resp.json()["detail"]

    # 8. Employee CANNOT access user management (403 Forbidden)
    emp_users_resp = client.get("/api/v1/admin/users", headers=emp_headers)
    assert emp_users_resp.status_code == 403

    # 9. Admin CAN delete the gift card
    admin_delete_resp = client.delete(f"/api/v1/admin/cards/{card_id}", headers=admin_headers)
    assert admin_delete_resp.status_code == 200
    assert admin_delete_resp.json()["success"] is True
