from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.core.pii import decrypt_pii
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
    success: bool = True
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
    end_user_code: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
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
    end_user_code: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
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


class ClientEngineerInviteRequest(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    client_subrole: ClientSubRole

    @field_validator("full_name")
    @classmethod
    def name_required(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Full name is required")
        return value.strip()

    @field_validator("client_subrole")
    @classmethod
    def manageable_client_role(cls, value: ClientSubRole) -> ClientSubRole:
        if value not in [ClientSubRole.JUNIOR_ENGINEER, ClientSubRole.ASSISTANT_ENGINEER]:
            raise ValueError("Role must be junior engineer or assistant engineer")
        return value


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    end_user_code: Optional[str] = None
    phone: Optional[str]
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    contractor_id: Optional[int]
    client_id: Optional[int]
    client_subrole: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def decrypt_user_pii(cls, value):
        if hasattr(value, "role") and getattr(value, "role", None) == UserRole.ENDUSER:
            return {
                "id": value.id,
                "email": decrypt_pii(value.email),
                "full_name": decrypt_pii(value.full_name),
                "role": value.role,
                "end_user_code": value.end_user_code,
                "phone": decrypt_pii(value.phone),
                "address_line1": decrypt_pii(value.address_line1),
                "address_line2": decrypt_pii(value.address_line2),
                "city": decrypt_pii(value.city),
                "state": decrypt_pii(value.state),
                "postal_code": decrypt_pii(value.postal_code),
                "country": decrypt_pii(value.country),
                "contractor_id": value.contractor_id,
                "client_id": value.client_id,
                "client_subrole": value.client_subrole,
                "is_active": value.is_active,
                "created_at": value.created_at,
            }
        return value


class UserSummary(BaseModel):
    id: int
    full_name: str
    role: UserRole
    email: str
    end_user_code: Optional[str] = None
    client_subrole: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def decrypt_user_pii(cls, value):
        if hasattr(value, "role") and getattr(value, "role", None) == UserRole.ENDUSER:
            return {
                "id": value.id,
                "full_name": decrypt_pii(value.full_name),
                "role": value.role,
                "email": decrypt_pii(value.email),
                "end_user_code": value.end_user_code,
                "client_subrole": value.client_subrole,
            }
        return value


TokenResponse.model_rebuild()
