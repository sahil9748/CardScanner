import pytest
from fastapi.testclient import TestClient
from app.services.api_key_service import ApiKeyService


def test_api_key_creation_and_auth(client: TestClient, admin_user, db_session):
    # Log in as admin to get admin token
    login_resp = client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin_user.email, "password": "AdminTest123!"},
    )
    assert login_resp.status_code == 200
    admin_token = login_resp.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin creates API key
    res = client.post(
        "/api/v1/admin/api-keys",
        headers=admin_headers,
        json={"name": "Test Integration App"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "api_key" in data
    assert data["api_key"].startswith("sk_live_")
    api_key_str = data["api_key"]
    key_id = data["id"]

    # 2. List API keys
    list_res = client.get("/api/v1/admin/api-keys", headers=admin_headers)
    assert list_res.status_code == 200
    assert any(k["id"] == key_id for k in list_res.json())

    # 3. Create PIN via Integration API using X-API-Key header
    pin_res = client.post(
        "/api/v1/integrations/pins",
        headers={"x-api-key": api_key_str},
        json={
            "label": "Order #999",
            "card_type": "double",
            "max_scans": 2,
            "expires_in_hours": 12,
            "webhook_url": "https://example.com/webhook",
            "redirect_url": "https://example.com/order/999/done",
        },
    )
    assert pin_res.status_code == 201
    pin_data = pin_res.json()
    assert pin_data["success"] is True
    assert len(pin_data["pin"]) == 4
    assert pin_data["card_type"] == "double"
    assert pin_data["max_scans"] == 2
    assert pin_data["redirect_url"] == "https://example.com/order/999/done"
    plain_pin = pin_data["pin"]
    pin_id = pin_data["pin_id"]

    # 4. Check PIN status by plain PIN string
    status_res1 = client.get(
        f"/api/v1/integrations/pins/{plain_pin}",
        headers={"Authorization": f"Bearer {api_key_str}"},
    )
    assert status_res1.status_code == 200
    assert status_res1.json()["pin_id"] == pin_id
    assert status_res1.json()["completed_scans"] == 0

    # 5. Check PIN status by UUID
    status_res2 = client.get(
        f"/api/v1/integrations/pins/{pin_id}",
        params={"api_key": api_key_str},
    )
    assert status_res2.status_code == 200
    assert status_res2.json()["pin_id"] == pin_id

    # 6. Customer logs in using this PIN and gets the configured card_type and redirect_url
    cust_res = client.post("/api/v1/access-pins/validate", json={"pin": plain_pin})
    assert cust_res.status_code == 200
    cust_data = cust_res.json()
    assert cust_data["card_type"] == "double"
    assert cust_data["redirect_url"] == "https://example.com/order/999/done"

    # 7. Revoke API Key
    revoke_res = client.delete(f"/api/v1/admin/api-keys/{key_id}", headers=admin_headers)
    assert revoke_res.status_code == 200

    # 8. Attempting to use revoked key should fail with 401
    failed_res = client.post(
        "/api/v1/integrations/pins",
        headers={"x-api-key": api_key_str},
        json={"label": "Order #1000"},
    )
    assert failed_res.status_code == 401
