from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import ClientSubRole, UserRole


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OtpRequest(BaseModel):
    identifier: str  # email or phone number


class OtpVerify(BaseModel):
    identifier: str
    otp_code: str


class OtpRequestResponse(BaseModel):
    message: str
    demo_otp: Optional[str] = None  # shown because email is not configured


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ── User schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole
    phone: Optional[str] = None
    contractor_id: Optional[int] = None
    client_id: Optional[int] = None
    client_subrole: Optional[ClientSubRole] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class InviteAcceptRequest(BaseModel):
    token: str
    full_name: str
    password: str
    phone: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class ContractorUserInviteRequest(BaseModel):
    email: EmailStr
    role: UserRole

    @field_validator("role")
    @classmethod
    def contractor_team_role(cls, value: UserRole) -> UserRole:
        if value not in [UserRole.SUPERVISOR, UserRole.WORKMAN]:
            raise ValueError("Role must be supervisor or workman")
        return value


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str]
    contractor_id: Optional[int]
    client_id: Optional[int]
    client_subrole: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    id: int
    full_name: str
    role: UserRole
    email: str
    client_subrole: Optional[str] = None

    model_config = {"from_attributes": True}


TokenResponse.model_rebuild()
