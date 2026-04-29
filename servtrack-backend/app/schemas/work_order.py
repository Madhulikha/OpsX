from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, field_validator

from app.models.work_order import WOStatus, WOPriority, WOCategory
from app.schemas.user import UserSummary
from app.schemas.contractor import ContractorSummary


# ── Activity Log ──────────────────────────────────────────────────────────────

class ActivityLogOut(BaseModel):
    id: int
    action: str
    note: Optional[str]
    from_status: Optional[str]
    to_status: Optional[str]
    created_at: datetime
    user: Optional[UserSummary]

    model_config = {"from_attributes": True}


class WorkOrderAttachmentOut(BaseModel):
    id: int
    file_url: str
    original_filename: str
    content_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Work Order ────────────────────────────────────────────────────────────────

class WorkOrderCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: WOCategory
    sub_category: Optional[str] = None
    area: str
    priority: WOPriority
    preferred_visit_time: Optional[str] = None
    sla_hours: int = 24
    due_date: Optional[datetime] = None
    contractor_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    workman_id: Optional[int] = None

    @field_validator("title", "area")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("This field is required")
        return value.strip()

    @field_validator("sla_hours")
    @classmethod
    def valid_sla(cls, value: int) -> int:
        if value < 1 or value > 720:
            raise ValueError("SLA hours must be between 1 and 720")
        return value


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[WOCategory] = None
    sub_category: Optional[str] = None
    area: Optional[str] = None
    priority: Optional[WOPriority] = None
    preferred_visit_time: Optional[str] = None
    sla_hours: Optional[int] = None
    due_date: Optional[datetime] = None
    contractor_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    workman_id: Optional[int] = None


class StatusTransitionRequest(BaseModel):
    new_status: WOStatus
    note: Optional[str] = None


class AdditionalDetailsRequest(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def required_note(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Additional details are required")
        return value.strip()


class WorkOrderOut(BaseModel):
    id: int
    ref_number: str
    title: str
    description: Optional[str]
    category: WOCategory
    sub_category: Optional[str]
    area: str
    preferred_visit_time: Optional[str]
    priority: WOPriority
    status: WOStatus
    sla_hours: int
    elapsed_hours: float
    sla_breached: bool
    due_date: Optional[datetime]
    started_at: Optional[datetime]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    raised_by_user: Optional[UserSummary]
    contractor: Optional[ContractorSummary]
    supervisor: Optional[UserSummary]
    workman: Optional[UserSummary]
    activity: List[ActivityLogOut] = []
    attachments: List[WorkOrderAttachmentOut] = []

    model_config = {"from_attributes": True}


class WorkOrderSummary(BaseModel):
    id: int
    ref_number: str
    title: str
    category: WOCategory
    sub_category: Optional[str]
    area: str
    preferred_visit_time: Optional[str]
    priority: WOPriority
    status: WOStatus
    sla_hours: int
    elapsed_hours: float
    sla_breached: bool
    due_date: Optional[datetime]
    created_at: datetime
    raised_by_user: Optional[UserSummary]
    contractor: Optional[ContractorSummary]
    supervisor: Optional[UserSummary]
    workman: Optional[UserSummary]
    attachments: List[WorkOrderAttachmentOut] = []

    model_config = {"from_attributes": True}


# ── Dashboard stats ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_open: int
    total_inprogress: int
    total_closed_this_month: int
    sla_breaches: int
    sla_compliance_pct: float
    avg_resolution_hours: float


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    title: str
    body: Optional[str]
    notif_type: str
    is_read: bool
    created_at: datetime
    work_order_id: Optional[int]

    model_config = {"from_attributes": True}
