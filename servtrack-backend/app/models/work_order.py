import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


enum_values = lambda enum_cls: [member.value for member in enum_cls]


class WOStatus(str, enum.Enum):
    OPEN       = "open"
    ASSIGNED   = "assigned"
    INPROGRESS = "inprogress"
    QC         = "qc"
    PENDING    = "pending"       # pending client approval
    CLOSED     = "closed"
    ESCALATED  = "escalated"


class WOPriority(str, enum.Enum):
    HIGH   = "High"
    MEDIUM = "Med"
    LOW    = "Low"


class WOCategory(str, enum.Enum):
    ELECTRICAL  = "Electrical"
    HVAC        = "HVAC"
    PLUMBING    = "Plumbing"
    CIVIL       = "Civil"
    FIRE_SAFETY = "Fire Safety"
    CARPENTRY   = "Carpentry"
    OTHER       = "Other"


# ── Valid status transitions per role ─────────────────────────────────────────
# Maps (current_status, role) → allowed_next_statuses
STATUS_TRANSITIONS: dict[tuple[str, str], list[str]] = {
    ("open",       "client"):     ["assigned"],
    ("assigned",   "contractor"): ["inprogress"],
    ("assigned",   "supervisor"): ["inprogress"],
    ("inprogress", "workman"):    ["qc"],
    ("inprogress", "supervisor"): ["qc"],
    ("qc",         "supervisor"): ["pending"],
    ("pending",    "client"):     ["closed", "inprogress"],   # approve or reject
    ("escalated",  "client"):     ["inprogress", "closed"],
}


def can_transition(current: str, next_status: str, role: str) -> bool:
    allowed = STATUS_TRANSITIONS.get((current, role), [])
    return next_status in allowed


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int]               = mapped_column(Integer, primary_key=True, index=True)
    ref_number: Mapped[str]       = mapped_column(String(20), unique=True, nullable=False, index=True)
    title: Mapped[str]            = mapped_column(String(300), nullable=False)
    description: Mapped[str]      = mapped_column(Text, nullable=True)
    category: Mapped[WOCategory]  = mapped_column(
        Enum(WOCategory, name="wo_category", values_callable=enum_values), nullable=False
    )
    area: Mapped[str]             = mapped_column(String(200), nullable=False)

    priority: Mapped[WOPriority]  = mapped_column(
        Enum(WOPriority, name="wo_priority", values_callable=enum_values), nullable=False
    )
    status: Mapped[WOStatus]      = mapped_column(
        Enum(WOStatus, name="wo_status", values_callable=enum_values),
        default=WOStatus.OPEN,
        nullable=False,
        index=True,
    )

    # People
    raised_by_id: Mapped[int]     = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    contractor_id: Mapped[int]    = mapped_column(
        Integer, ForeignKey("contractors.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    supervisor_id: Mapped[int]    = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    workman_id: Mapped[int]       = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # SLA
    sla_hours: Mapped[int]        = mapped_column(Integer, default=24, nullable=False)
    due_date: Mapped[datetime]    = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), nullable=True)
    sla_breached: Mapped[bool]    = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime]  = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    updated_at: Mapped[datetime]  = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    raised_by_user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="work_orders_raised", foreign_keys=[raised_by_id],
    )
    contractor: Mapped["Contractor"] = relationship(  # noqa: F821
        "Contractor", back_populates="work_orders",
    )
    supervisor: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[supervisor_id],
    )
    workman: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[workman_id],
    )
    activity: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog", back_populates="work_order",
        order_by="ActivityLog.created_at",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="work_order",
        cascade="all, delete-orphan",
    )

    @property
    def elapsed_hours(self) -> float:
        ref = self.started_at or self.created_at
        end = self.closed_at or datetime.now(timezone.utc)
        return round((end - ref).total_seconds() / 3600, 1)

    def __repr__(self) -> str:
        return f"<WorkOrder {self.ref_number} status={self.status}>"


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int]               = mapped_column(Integer, primary_key=True, index=True)
    work_order_id: Mapped[int]    = mapped_column(
        Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int]          = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    action: Mapped[str]           = mapped_column(String(300), nullable=False)
    note: Mapped[str]             = mapped_column(Text, nullable=True)
    from_status: Mapped[str]      = mapped_column(String(50), nullable=True)
    to_status: Mapped[str]        = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime]  = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    # Relationships
    work_order: Mapped["WorkOrder"] = relationship("WorkOrder", back_populates="activity")
    user: Mapped["User"] = relationship("User", back_populates="activity_log")  # noqa: F821


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int]               = mapped_column(Integer, primary_key=True, index=True)
    work_order_id: Mapped[int]    = mapped_column(
        Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    user_id: Mapped[int]          = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str]            = mapped_column(String(200), nullable=False)
    body: Mapped[str]             = mapped_column(Text, nullable=True)
    notif_type: Mapped[str]       = mapped_column(String(50), default="info", nullable=False)
    is_read: Mapped[bool]         = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime]  = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    # Relationships
    work_order: Mapped["WorkOrder"] = relationship("WorkOrder", back_populates="notifications")
