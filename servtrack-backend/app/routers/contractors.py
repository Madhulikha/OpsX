from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.contractor import Contractor, Contract
from app.models.user import User, UserRole
from app.schemas.contractor import (
    ContractorCreate, ContractorUpdate, ContractorOut,
    ContractCreate, ContractOut,
)

router = APIRouter(prefix="/contractors", tags=["Contractors"])


# ── Contractors ───────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ContractorOut])
def list_contractors(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Contractor).filter(Contractor.is_active == True).order_by(Contractor.name).all()


@router.post("/", response_model=ContractorOut, status_code=201)
def create_contractor(
    payload: ContractorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    contractor = Contractor(**payload.model_dump())
    db.add(contractor)
    db.commit()
    db.refresh(contractor)
    return contractor


@router.get("/{contractor_id}", response_model=ContractorOut)
def get_contractor(
    contractor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return c


@router.patch("/{contractor_id}", response_model=ContractorOut)
def update_contractor(
    contractor_id: int,
    payload: ContractorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


# ── Contracts ─────────────────────────────────────────────────────────────────

@router.get("/{contractor_id}/contracts", response_model=List[ContractOut])
def list_contracts(
    contractor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Contract).filter(Contract.contractor_id == contractor_id).all()


@router.post("/contracts", response_model=ContractOut, status_code=201)
def create_contract(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.CLIENT)),
):
    contract = Contract(**payload.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract
