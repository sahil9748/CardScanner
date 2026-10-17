from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_staff_user
from app.models.user import User
from app.services.admin_service import AdminService

router = APIRouter()


@router.get("/dashboard")
def get_dashboard_data(
    current_user: User = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Retrieve aggregated live dashboard metrics (Accessible to admin and employees)."""
    metrics = AdminService.get_dashboard_metrics(db)
    return {
        "success": True,
        "metrics": metrics,
    }
