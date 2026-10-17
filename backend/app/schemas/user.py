from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    role: str = Field(default="employee", pattern="^(employee|admin)$")


class UserUpdateRequest(BaseModel):
    status: Optional[str] = Field(None, pattern="^(active|disabled)$")
    role: Optional[str] = Field(None, pattern="^(employee|admin)$")
    password: Optional[str] = Field(None, min_length=8)


class UserItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
    status: str
    created_at: datetime
    last_login_at: Optional[datetime] = None


class UserListResponse(BaseModel):
    items: List[UserItemResponse]
    total: int
