from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, HttpUrl


class IntegrationPinCreateRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=255, description="Reference label, e.g. Order #1042")
    card_type: Optional[str] = Field("single", description="Card scan type: 'single' (1-sided) or 'double' (2-sided)")
    pin_length: Optional[int] = Field(4, ge=4, le=5, description="PIN length: 4 or 5 digits")
    max_scans: Optional[int] = Field(1, ge=1, le=100, description="Number of cards allowed to scan (default: 1)")
    expires_in_hours: Optional[int] = Field(24, ge=1, le=720, description="Hours until PIN expiration (default: 24h)")
    webhook_url: Optional[str] = Field(None, description="Optional URL to receive POST callback on card completion")
    redirect_url: Optional[str] = Field(None, description="Optional URL to redirect customer back to your app after completion")


class IntegrationPinResponse(BaseModel):
    success: bool = True
    pin: str
    pin_id: str
    scan_url: str
    label: Optional[str] = None
    card_type: str = "single"
    status: str
    max_scans: Optional[int] = 1
    completed_scans: int = 0
    expires_at: Optional[str] = None
    webhook_url: Optional[str] = None
    redirect_url: Optional[str] = None


class IntegrationCardImageItem(BaseModel):
    side: str
    preview_url: str
    original_url: str
    width: int
    height: int
    mime_type: str


class IntegrationCardItem(BaseModel):
    id: str
    reference_code: str
    card_type: str
    status: str
    created_at: str
    images: List[IntegrationCardImageItem]


class IntegrationPinStatusResponse(BaseModel):
    pin_id: str
    label: Optional[str] = None
    status: str
    completed_scans: int
    max_scans: Optional[int] = None
    expires_at: Optional[str] = None
    scan_url: str
    cards: List[IntegrationCardItem]


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Descriptive name, e.g. 'Main E-commerce App'")


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    is_active: bool
    created_by: Optional[str] = None
    created_at: str
    last_used_at: Optional[str] = None


class ApiKeyCreatedResponse(BaseModel):
    id: str
    name: str
    api_key: str
    key_prefix: str
    created_at: str
