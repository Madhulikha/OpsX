from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.models.client import ClientAccount, ClientContractorLink, ClientContractorStatus
from app.models.contractor import Contractor
from app.models.user import User, UserRole
from app.models.work_order import WOStatus, WorkOrder
from app.schemas.admin import (
    AdminClientSummary,
    AdminOverview,
    ClientOnboardRequest,
    ClientOnboardResponse,
)
from app.services.email_service import build_client_invite_url, send_client_invite

router = APIRouter(prefix="/admin", tags=["Admin"])


def _client_summary(db: Session, client: ClientAccount) -> AdminClientSummary:
    engineer_count = db.query(func.count(User.id)).filter(
        User.client_id == client.id,
        User.role == UserRole.CLIENT,
        User.is_active == True,
    ).scalar() or 0
    enduser_count = db.query(func.count(User.id)).filter(
        User.client_id == client.id,
        User.role == UserRole.ENDUSER,
        User.is_active == True,
    ).scalar() or 0
    contractor_count = db.query(func.count(ClientContractorLink.id)).filter(
        ClientContractorLink.client_id == client.id,
        ClientContractorLink.status != ClientContractorStatus.INACTIVE,
    ).scalar() or 0
    active_work_orders = db.query(func.count(WorkOrder.id)).filter(
        WorkOrder.client_id == client.id,
        WorkOrder.status != WOStatus.CLOSED,
    ).scalar() or 0
    total_work_orders = db.query(func.count(WorkOrder.id)).filter(
        WorkOrder.client_id == client.id,
    ).scalar() or 0

    return AdminClientSummary(
        id=client.id,
        name=client.name,
        created_at=client.created_at,
        engineer_count=int(engineer_count),
        enduser_count=int(enduser_count),
        contractor_count=int(contractor_count),
        active_work_orders=int(active_work_orders),
        total_work_orders=int(total_work_orders),
    )


@router.get("/overview", response_model=AdminOverview)
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPERADMIN)),
):
    return AdminOverview(
        total_clients=db.query(func.count(ClientAccount.id)).scalar() or 0,
        total_users=db.query(func.count(User.id)).filter(User.role != UserRole.SUPERADMIN).scalar() or 0,
        total_contractors=db.query(func.count(Contractor.id)).scalar() or 0,
        active_contractors=db.query(func.count(Contractor.id)).filter(Contractor.is_active == True).scalar() or 0,
        linked_contractors=db.query(func.count(ClientContractorLink.id)).filter(
            ClientContractorLink.status != ClientContractorStatus.INACTIVE,
        ).scalar() or 0,
        total_work_orders=db.query(func.count(WorkOrder.id)).scalar() or 0,
        open_work_orders=db.query(func.count(WorkOrder.id)).filter(WorkOrder.status == WOStatus.OPEN).scalar() or 0,
        inprogress_work_orders=db.query(func.count(WorkOrder.id)).filter(WorkOrder.status == WOStatus.INPROGRESS).scalar() or 0,
        closed_work_orders=db.query(func.count(WorkOrder.id)).filter(WorkOrder.status == WOStatus.CLOSED).scalar() or 0,
        sla_breaches=db.query(func.count(WorkOrder.id)).filter(
            (WorkOrder.sla_breached == True) | (WorkOrder.status == WOStatus.ESCALATED),
        ).scalar() or 0,
    )


@router.get("/clients", response_model=List[AdminClientSummary])
def list_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPERADMIN)),
):
    clients = db.query(ClientAccount).order_by(ClientAccount.created_at.desc()).all()
    return [_client_summary(db, client) for client in clients]


@router.post("/clients", response_model=ClientOnboardResponse, status_code=201)
def onboard_client(
    payload: ClientOnboardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPERADMIN)),
):
    client_name = payload.client_name.strip()
    admin_email = payload.admin_email.lower()

    if db.query(ClientAccount).filter(func.lower(ClientAccount.name) == client_name.lower()).first():
        raise HTTPException(status_code=409, detail="Client already exists")
    if db.query(User).filter(User.email == admin_email).first():
        raise HTTPException(status_code=409, detail="Admin email is already registered")

    client = ClientAccount(
        name=client_name,
    )
    db.add(client)
    db.flush()

    db.commit()
    db.refresh(client)

    invite_url = build_client_invite_url(
        admin_email,
        client.id,
        client.name,
        payload.admin_full_name.strip(),
    )
    invite_sent = send_client_invite(admin_email, client.name, current_user, invite_url)

    return ClientOnboardResponse(
        client=_client_summary(db, client),
        admin_email=admin_email,
        invite_sent=invite_sent,
        invite_url=None if invite_sent else invite_url,
    )
