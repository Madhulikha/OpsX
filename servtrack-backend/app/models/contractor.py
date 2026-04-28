import enum
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


enum_values = lambda enum_cls: [member.value for member in enum_cls]


class ContractStatus(str, enum.Enum):
    ACTIVE   = "active"
    EXPIRED  = "expired"
    PENDING  = "pending"
    PAUSED   = "paused"


class Contractor(Base):
    __tablename__ = "contractors"

    id: Mapped[int]             = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str]           = mapped_column(String(200), nullable=False)
    speciality: Mapped[str]     = mapped_column(String(300), nullable=True)
    email: Mapped[str]          = mapped_column(String(255), nullable=True)
    phone: Mapped[str]          = mapped_column(String(20),  nullable=True)
    address: Mapped[str]        = mapped_column(Text, nullable=True)
    rating: Mapped[float]       = mapped_column(Float, default=0.0, nullable=False)
    is_active: Mapped[bool]     = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="contractor")  # noqa: F821
    contracts: Mapped[list["Contract"]] = relationship("Contract", back_populates="contractor")
    work_orders: Mapped[list["WorkOrder"]] = relationship("WorkOrder", back_populates="contractor")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Contractor id={self.id} name={self.name}>"


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[int]                 = mapped_column(Integer, primary_key=True, index=True)
    contractor_id: Mapped[int]      = mapped_column(
        Integer, ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str]              = mapped_column(String(300), nullable=False)
    scope: Mapped[str]              = mapped_column(Text, nullable=True)
    start_date: Mapped[date]        = mapped_column(Date, nullable=False)
    end_date: Mapped[date]          = mapped_column(Date, nullable=False)
    value: Mapped[float]            = mapped_column(Float, default=0.0, nullable=False)
    default_sla_hours: Mapped[int]  = mapped_column(Integer, default=24, nullable=False)
    status: Mapped[ContractStatus]  = mapped_column(
        Enum(ContractStatus, name="contract_status", values_callable=enum_values),
        default=ContractStatus.ACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime]    = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    contractor: Mapped["Contractor"] = relationship("Contractor", back_populates="contracts")
