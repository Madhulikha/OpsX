from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models.contractor import ContractStatus
from app.models.client import ClientContractorStatus


class ContractorCreate(BaseModel):
    name: str
    speciality: str
    email: EmailStr
    phone: str
    address: str

    @field_validator("name", "speciality", "phone", "address")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("This field is required")
        return value.strip()


class ContractorUpdate(BaseModel):
    name: Optional[str] = None
    speciality: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class ContractorOut(BaseModel):
    id: int
    name: str
    speciality: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    rating: float
    is_active: bool
    created_at: datetime
    link_status: Optional[ClientContractorStatus] = None
    linked_at: Optional[datetime] = None
    has_login: bool = False
    active_user_count: int = 0
    manager_count: int = 0
    invite_sent: bool = False
    invite_url: Optional[str] = None

    model_config = {"from_attributes": True}


class ContractorSummary(BaseModel):
    id: int
    name: str
    speciality: Optional[str]
    rating: float
    has_login: bool = False
    link_status: Optional[ClientContractorStatus] = None

    model_config = {"from_attributes": True}


class ContractorLinkRequest(BaseModel):
    contractor_id: int


class ContractorDiscoverOut(BaseModel):
    id: int
    name: str
    speciality: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    rating: float
    has_login: bool = False
    active_user_count: int = 0

    model_config = {"from_attributes": True}


# ── Contract ──────────────────────────────────────────────────────────────────

class ContractCreate(BaseModel):
    contractor_id: int
    title: str
    scope: Optional[str] = None
    start_date: date
    end_date: date
    value: float = 0.0
    default_sla_hours: int = 24
    status: ContractStatus = ContractStatus.ACTIVE


class ContractOut(BaseModel):
    id: int
    client_id: Optional[int] = None
    contractor_id: int
    title: str
    scope: Optional[str]
    start_date: date
    end_date: date
    value: float
    default_sla_hours: int
    status: ContractStatus
    created_at: datetime
    contractor: ContractorSummary

    model_config = {"from_attributes": True}
