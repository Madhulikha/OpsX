import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


enum_values = lambda enum_cls: [member.value for member in enum_cls]


class ClientContractorStatus(str, enum.Enum):
    LINKED = "linked"
    INVITED = "invited"
    INACTIVE = "inactive"


class ClientAccount(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="client_account")  # noqa: F821
    work_orders: Mapped[list["WorkOrder"]] = relationship("WorkOrder", back_populates="client_account")  # noqa: F821
    contractor_links: Mapped[list["ClientContractorLink"]] = relationship(
        "ClientContractorLink",
        back_populates="client",
        cascade="all, delete-orphan",
    )


class ClientContractorLink(Base):
    __tablename__ = "client_contractor_links"
    __table_args__ = (
        UniqueConstraint("client_id", "contractor_id", name="uq_client_contractor_link"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contractor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ClientContractorStatus] = mapped_column(
        Enum(ClientContractorStatus, name="client_contractor_status", values_callable=enum_values),
        default=ClientContractorStatus.LINKED,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    client: Mapped["ClientAccount"] = relationship("ClientAccount", back_populates="contractor_links")
    contractor: Mapped["Contractor"] = relationship("Contractor", back_populates="client_links")  # noqa: F821
