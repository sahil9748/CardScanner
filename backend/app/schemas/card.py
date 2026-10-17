from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class CardImageResponse(BaseModel):
    id: str
    side: str
    original_url: str
    processed_url: str
    thumbnail_url: str
    original_width: int
    original_height: int
    processed_width: int
    processed_height: int
    file_size: int
    mime_type: str
    created_at: datetime


class GiftCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference_code: str
    card_type: str
    status: str
    brand: Optional[str] = None
    denomination: Optional[str] = None
    notes: Optional[str] = None
    pin_label: Optional[str] = None
    scan_session_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    images: List[CardImageResponse] = []


class GiftCardUpdateRequest(BaseModel):
    brand: Optional[str] = Field(None, max_length=100)
    denomination: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(completed|flagged|archived)$")


class GiftCardListResponse(BaseModel):
    items: List[GiftCardResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
