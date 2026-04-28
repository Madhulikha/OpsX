from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel

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


# ── Work Order ────────────────────────────────────────────────────────────────

class WorkOrderCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: WOCategory
    area: str
    priority: WOPriority
    sla_hours: int = 24
    due_date: Optional[datetime] = None
    contractor_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    workman_id: Optional[int] = None


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[WOCategory] = None
    area: Optional[str] = None
    priority: Optional[WOPriority] = None
    sla_hours: Optional[int] = None
    due_date: Optional[datetime] = None
    contractor_id: Optional[int] = None
    supervisor_id: Optional[int] = None
    workman_id: Optional[int] = None


class StatusTransitionRequest(BaseModel):
    new_status: WOStatus
    note: Optional[str] = None


class WorkOrderOut(BaseModel):
    id: int
    ref_number: str
    title: str
    description: Optional[str]
    category: WOCategory
    area: str
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

    model_config = {"from_attributes": True}


class WorkOrderSummary(BaseModel):
    id: int
    ref_number: str
    title: str
    category: WOCategory
    area: str
    priority: WOPriority
    status: WOStatus
    sla_hours: int
    elapsed_hours: float
    sla_breached: bool
    due_date: Optional[datetime]
    created_at: datetime
    contractor: Optional[ContractorSummary]
    supervisor: Optional[UserSummary]

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
