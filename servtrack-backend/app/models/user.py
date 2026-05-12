import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    SUPERADMIN = "superadmin"
    CLIENT     = "client"
    CONTRACTOR = "contractor"
    SUPERVISOR = "supervisor"
    WORKMAN    = "workman"
    ENDUSER    = "enduser"


class ClientSubRole(str, enum.Enum):
    JUNIOR_ENGINEER = "junior_engineer"
    ASSISTANT_ENGINEER = "assistant_engineer"
    COMMANDANT_ENGINEER = "commandant_engineer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str]       = mapped_column(Text, unique=True, index=True, nullable=False)
    full_name: Mapped[str]   = mapped_column(Text, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    end_user_code: Mapped[str] = mapped_column(String(40), nullable=True, index=True)
    email_lookup_hash: Mapped[str] = mapped_column(String(64), nullable=True, index=True)
    phone_lookup_hash: Mapped[str] = mapped_column(String(64), nullable=True, index=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=True, values_callable=lambda obj: [e.value for e in obj])
    )
    phone: Mapped[str]       = mapped_column(String(255), nullable=True)
    address_line1: Mapped[str] = mapped_column(Text, nullable=True)
    address_line2: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(Text, nullable=True)
    state: Mapped[str] = mapped_column(Text, nullable=True)
    postal_code: Mapped[str] = mapped_column(Text, nullable=True)
    country: Mapped[str] = mapped_column(Text, nullable=True)

    # Contractor FK — set for supervisors and workmen
    contractor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contractors.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    client_subrole: Mapped[str] = mapped_column(String(50), nullable=True, index=True)
    otp_code: Mapped[str] = mapped_column(String(255), nullable=True)
    otp_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    is_active: Mapped[bool]  = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    contractor: Mapped["Contractor"] = relationship("Contractor", back_populates="users")  # noqa: F821
    client_account: Mapped["ClientAccount"] = relationship("ClientAccount", back_populates="users")  # noqa: F821

    work_orders_raised: Mapped[list["WorkOrder"]] = relationship(  # noqa: F821
        "WorkOrder", back_populates="raised_by_user", foreign_keys="WorkOrder.raised_by_id"
    )
    activity_log: Mapped[list["ActivityLog"]] = relationship(  # noqa: F821
        "ActivityLog", back_populates="user"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
