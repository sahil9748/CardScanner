from fastapi import APIRouter
from app.api.v1.endpoints import (
    customer_pins,
    customer_sessions,
    auth,
    admin_dashboard,
    admin_cards,
    admin_pins,
    admin_audit,
    admin_users,
    admin_api_keys,
    integrations,
)

api_router = APIRouter()

# Customer Routes
api_router.include_router(customer_pins.router, prefix="/access-pins", tags=["Customer Access PINs"])
api_router.include_router(customer_sessions.router, prefix="/sessions", tags=["Customer Sessions"])

# External Integrations (Third-party Web Apps)
api_router.include_router(integrations.router, prefix="/integrations", tags=["External Integrations"])

# Admin & Staff Routes
api_router.include_router(auth.router, prefix="/admin/auth", tags=["Admin Auth"])
api_router.include_router(admin_dashboard.router, prefix="/admin", tags=["Admin Dashboard"])
api_router.include_router(admin_cards.router, prefix="/admin", tags=["Admin Card Management"])
api_router.include_router(admin_pins.router, prefix="/admin", tags=["Admin PIN Management"])
api_router.include_router(admin_audit.router, prefix="/admin", tags=["Admin Audit Logs"])
api_router.include_router(admin_users.router, prefix="/admin", tags=["Admin User Management"])
api_router.include_router(admin_api_keys.router, prefix="/admin", tags=["Admin API Keys"])
