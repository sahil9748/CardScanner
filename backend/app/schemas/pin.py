from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict


class PinValidateRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=5, description="4 or 5 digit numeric PIN")

    @field_validator("pin")
    @classmethod
    def validate_numeric(cls, v: str) -> str:
        clean = v.strip()
        if not clean.isdigit():
            raise ValueError("PIN must contain only numeric digits")
        if len(clean) not in (4, 5):
            raise ValueError("PIN length must be exactly 4 or 5 digits")
        return clean


class PinCreateRequest(BaseModel):
    pin_length: int = Field(default=4, ge=4, le=5, description="PIN length: 4 or 5 digits")
    label: Optional[str] = Field(default=None, max_length=255)
    max_completed_scans: Optional[int] = Field(default=1, ge=1, description="Max cards allowed (None for unlimited)")
    expires_at: Optional[datetime] = None


class PinBatchCreateRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=50, description="Number of PINs to generate")
    pin_length: int = Field(default=4, ge=4, le=5)
    label_prefix: Optional[str] = Field(default=None, max_length=100)
    max_completed_scans: Optional[int] = Field(default=1, ge=1)
    expires_at: Optional[datetime] = None


class PinUpdateRequest(BaseModel):
    label: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|revoked|expired|exhausted)$")
    max_completed_scans: Optional[int] = None
    expires_at: Optional[datetime] = None


class CreatedPinInfo(BaseModel):
    id: str
    pin: str  # Revealed only during generation!
    pin_length: int
    label: Optional[str]
    status: str
    max_completed_scans: Optional[int]
    expires_at: Optional[datetime]
    created_at: datetime


class PinItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pin_length: int
    label: Optional[str]
    status: str
    max_completed_scans: Optional[int]
    completed_scans: int
    expires_at: Optional[datetime]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    revoked_at: Optional[datetime]


class PinListResponse(BaseModel):
    items: List[PinItemResponse]
    total: int
