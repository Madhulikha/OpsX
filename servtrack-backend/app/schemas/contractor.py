from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.contractor import ContractStatus


class ContractorCreate(BaseModel):
    name: str
    speciality: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


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

    model_config = {"from_attributes": True}


class ContractorSummary(BaseModel):
    id: int
    name: str
    speciality: Optional[str]
    rating: float

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
