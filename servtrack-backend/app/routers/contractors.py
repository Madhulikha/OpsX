from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.client import ClientContractorLink, ClientContractorStatus
from app.models.contractor import Contractor, Contract
from app.models.user import User, UserRole
from app.schemas.contractor import (
    ContractorCreate, ContractorUpdate, ContractorOut, ContractorLinkRequest, ContractorDiscoverOut,
    ContractCreate, ContractOut,
)
from app.services.email_service import build_contractor_invite_url, send_contractor_invite

router = APIRouter(prefix="/contractors", tags=["Contractors"])


def _ensure_client_context(current_user: User) -> int:
    if current_user.client_id is None:
        raise HTTPException(status_code=422, detail="Your account is not linked to a client")
    return current_user.client_id


def _serialize_contractor(
    db: Session,
    contractor: Contractor,
    link: Optional[ClientContractorLink] = None,
    invite_sent: bool = False,
    invite_url: Optional[str] = None,
) -> ContractorOut:
    active_user_count = (
        db.query(func.count(User.id))
        .filter(
            User.contractor_id == contractor.id,
            User.is_active == True,
            User.role.in_([UserRole.CONTRACTOR, UserRole.SUPERVISOR, UserRole.WORKMAN]),
        )
        .scalar()
        or 0
    )
    manager_count = (
        db.query(func.count(User.id))
        .filter(
            User.contractor_id == contractor.id,
            User.is_active == True,
            User.role == UserRole.CONTRACTOR,
        )
        .scalar()
        or 0
    )
    return ContractorOut(
        id=contractor.id,
        name=contractor.name,
        speciality=contractor.speciality,
        email=contractor.email,
        phone=contractor.phone,
        address=contractor.address,
        rating=float(contractor.rating),
        is_active=contractor.is_active,
        created_at=contractor.created_at,
        link_status=link.status if link else None,
        linked_at=link.created_at if link else None,
        has_login=active_user_count > 0,
        active_user_count=int(active_user_count),
        manager_count=int(manager_count),
        invite_sent=invite_sent,
        invite_url=invite_url,
    )


def _serialize_discover(db: Session, contractor: Contractor) -> ContractorDiscoverOut:
    active_user_count = (
        db.query(func.count(User.id))
        .filter(
            User.contractor_id == contractor.id,
            User.is_active == True,
            User.role.in_([UserRole.CONTRACTOR, UserRole.SUPERVISOR, UserRole.WORKMAN]),
        )
        .scalar()
        or 0
    )
    return ContractorDiscoverOut(
        id=contractor.id,
        name=contractor.name,
        speciality=contractor.speciality,
        email=contractor.email,
        phone=contractor.phone,
        rating=float(contractor.rating),
        has_login=active_user_count > 0,
        active_user_count=int(active_user_count),
    )


def _get_client_link(
    db: Session,
    current_user: User,
    contractor_id: int,
    allow_inactive: bool = False,
) -> ClientContractorLink:
    client_id = _ensure_client_context(current_user)
    q = db.query(ClientContractorLink).filter(
        ClientContractorLink.client_id == client_id,
        ClientContractorLink.contractor_id == contractor_id,
    )
    if not allow_inactive:
        q = q.filter(ClientContractorLink.status != ClientContractorStatus.INACTIVE)
    link = q.first()
    if not link:
        raise HTTPException(status_code=404, detail="Contractor not linked to this client")
    return link


@router.get("/", response_model=List[ContractorOut])
def list_contractors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in [UserRole.CLIENT, UserRole.ENDUSER] and current_user.client_id:
        links = (
            db.query(ClientContractorLink)
            .options(joinedload(ClientContractorLink.contractor))
            .filter(
                ClientContractorLink.client_id == current_user.client_id,
                ClientContractorLink.status != ClientContractorStatus.INACTIVE,
            )
            .order_by(ClientContractorLink.created_at.desc())
            .all()
        )
        return [_serialize_contractor(db, link.contractor, link) for link in links if link.contractor and link.contractor.is_active]

    if current_user.role in [UserRole.CONTRACTOR, UserRole.SUPERVISOR, UserRole.WORKMAN] and current_user.contractor_id:
        contractor = db.query(Contractor).filter(Contractor.id == current_user.contractor_id).first()
        return [_serialize_contractor(db, contractor)] if contractor else []

    contractors = db.query(Contractor).filter(Contractor.is_active == True).order_by(Contractor.name).all()
    return [_serialize_contractor(db, contractor) for contractor in contractors]


@router.get("/discover", response_model=List[ContractorDiscoverOut])
def discover_contractors(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    client_id = _ensure_client_context(current_user)
    linked_ids = db.query(ClientContractorLink.contractor_id).filter(
        ClientContractorLink.client_id == client_id,
        ClientContractorLink.status != ClientContractorStatus.INACTIVE,
    )
    q = db.query(Contractor).filter(
        Contractor.is_active == True,
        Contractor.id.notin_(linked_ids),
    )
    if search:
        q = q.filter(
            Contractor.name.ilike(f"%{search}%") |
            Contractor.speciality.ilike(f"%{search}%")
        )
    contractors = q.order_by(Contractor.name).limit(20).all()
    return [_serialize_discover(db, contractor) for contractor in contractors]


@router.post("/link", response_model=ContractorOut, status_code=201)
def link_existing_contractor(
    payload: ContractorLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    client_id = _ensure_client_context(current_user)
    contractor = db.query(Contractor).filter(Contractor.id == payload.contractor_id, Contractor.is_active == True).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    link = db.query(ClientContractorLink).filter(
        ClientContractorLink.client_id == client_id,
        ClientContractorLink.contractor_id == contractor.id,
    ).first()
    if link:
        link.status = ClientContractorStatus.LINKED
    else:
        link = ClientContractorLink(
            client_id=client_id,
            contractor_id=contractor.id,
            status=ClientContractorStatus.LINKED,
        )
        db.add(link)

    invite_sent = False
    fallback_invite_url = None
    if contractor.email and not db.query(User).filter(
        User.contractor_id == contractor.id,
        User.role == UserRole.CONTRACTOR,
        User.is_active == True,
    ).first():
        invite_url = build_contractor_invite_url(contractor)
        invite_sent = send_contractor_invite(contractor, current_user, invite_url)
        if invite_sent:
            link.status = ClientContractorStatus.INVITED
        else:
            fallback_invite_url = invite_url

    db.commit()
    db.refresh(link)
    return _serialize_contractor(
        db,
        contractor,
        link,
        invite_sent=invite_sent,
        invite_url=fallback_invite_url if not invite_sent else None,
    )


@router.post("/", response_model=ContractorOut, status_code=201)
def create_contractor(
    payload: ContractorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    client_id = _ensure_client_context(current_user)

    existing = db.query(Contractor).filter(
        Contractor.name.ilike(payload.name.strip()),
        Contractor.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A contractor with this name already exists. Link it instead.")

    contractor = Contractor(**payload.model_dump())
    db.add(contractor)
    db.flush()

    link = ClientContractorLink(
        client_id=client_id,
        contractor_id=contractor.id,
        status=ClientContractorStatus.LINKED,
    )
    db.add(link)
    fallback_invite_url = None
    if contractor.email:
        invite_url = build_contractor_invite_url(contractor)
        invite_sent = send_contractor_invite(contractor, current_user, invite_url)
        if not invite_sent:
            fallback_invite_url = invite_url
    else:
        invite_sent = False
    if invite_sent:
        link.status = ClientContractorStatus.INVITED
    db.commit()
    db.refresh(contractor)
    db.refresh(link)
    return _serialize_contractor(
        db,
        contractor,
        link,
        invite_sent=invite_sent,
        invite_url=fallback_invite_url,
    )


@router.get("/contracts", response_model=List[ContractOut])
def list_client_contracts(
    status: Optional[str] = Query(None),
    contractor_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Contract).options(joinedload(Contract.contractor))

    if current_user.role in [UserRole.CLIENT, UserRole.ENDUSER]:
        client_id = _ensure_client_context(current_user)
        linked_ids = db.query(ClientContractorLink.contractor_id).filter(
            ClientContractorLink.client_id == client_id,
            ClientContractorLink.status != ClientContractorStatus.INACTIVE,
        )
        q = q.filter(Contract.contractor_id.in_(linked_ids))
    elif current_user.role in [UserRole.CONTRACTOR, UserRole.SUPERVISOR, UserRole.WORKMAN]:
        if not current_user.contractor_id:
            return []
        q = q.filter(Contract.contractor_id == current_user.contractor_id)

    if contractor_id:
        q = q.filter(Contract.contractor_id == contractor_id)
    if status:
        q = q.filter(Contract.status == status)

    return q.order_by(Contract.end_date.asc()).all()


@router.post("/contracts", response_model=ContractOut, status_code=201)
def create_contract(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    _get_client_link(db, current_user, payload.contractor_id)
    contract = Contract(**payload.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.get("/{contractor_id}", response_model=ContractorOut)
def get_contractor(
    contractor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    if current_user.role in [UserRole.CLIENT, UserRole.ENDUSER]:
        link = _get_client_link(db, current_user, contractor_id)
        return _serialize_contractor(db, contractor, link)

    if current_user.role in [UserRole.CONTRACTOR, UserRole.SUPERVISOR, UserRole.WORKMAN] and current_user.contractor_id != contractor_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    return _serialize_contractor(db, contractor)


@router.patch("/{contractor_id}", response_model=ContractorOut)
def update_contractor(
    contractor_id: int,
    payload: ContractorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    link = _get_client_link(db, current_user, contractor_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(contractor, key, value)
    db.commit()
    db.refresh(contractor)
    return _serialize_contractor(db, contractor, link)


@router.get("/{contractor_id}/contracts", response_model=List[ContractOut])
def list_contracts(
    contractor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in [UserRole.CLIENT, UserRole.ENDUSER]:
        _get_client_link(db, current_user, contractor_id)
    return db.query(Contract).filter(Contract.contractor_id == contractor_id).all()
