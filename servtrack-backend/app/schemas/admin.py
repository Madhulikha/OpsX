from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class AdminOverview(BaseModel):
    total_clients: int
    total_users: int
    total_contractors: int
    active_contractors: int
    linked_contractors: int
    total_work_orders: int
    open_work_orders: int
    inprogress_work_orders: int
    closed_work_orders: int
    sla_breaches: int


class AdminClientSummary(BaseModel):
    id: int
    name: str
    created_at: datetime
    engineer_count: int
    enduser_count: int
    contractor_count: int
    active_work_orders: int
    total_work_orders: int


class ClientOnboardRequest(BaseModel):
    client_name: str
    admin_full_name: str
    admin_email: EmailStr
    admin_phone: Optional[str] = None

    @field_validator("client_name", "admin_full_name")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("This field is required")
        return value.strip()


class ClientOnboardResponse(BaseModel):
    client: AdminClientSummary
    admin_email: str
    invite_sent: bool
    invite_url: Optional[str] = None
