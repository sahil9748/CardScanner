from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class SessionInitRequest(BaseModel):
    card_type: str = Field(default="single", pattern="^(single|double)$")


class SessionImageInfo(BaseModel):
    side: str  # "front" or "back"
    original_url: str
    processed_url: str
    original_width: int
    original_height: int
    processed_width: int
    processed_height: int
    file_size: int
    created_at: datetime


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    card_type: str
    status: str
    front_capture_status: str
    back_capture_status: str
    created_at: datetime
    expires_at: datetime
    completed_at: Optional[datetime] = None
    pin_label: Optional[str] = None
    remaining_scans: Optional[int] = None
    images: List[SessionImageInfo] = []


class CompleteSessionResponse(BaseModel):
    session_id: str
    status: str
    gift_card_id: str
    reference_code: str
    message: str
