from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
    status: str
    created_at: datetime
    last_login_at: Optional[datetime] = None
