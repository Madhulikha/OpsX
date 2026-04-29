from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.client import ClientContractorLink, ClientContractorStatus
from app.models.user import User, UserRole
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserOut])
def list_users(
    role: Optional[str] = Query(None),
    contractor_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT, UserRole.CONTRACTOR, UserRole.SUPERVISOR)),
):
    q = db.query(User).filter(User.is_active == True)
    if role:
        q = q.filter(User.role == role)
    if contractor_id:
        q = q.filter(User.contractor_id == contractor_id)
    if current_user.role == UserRole.CLIENT and contractor_id:
        if current_user.client_id is None:
            raise HTTPException(status_code=422, detail="Your account is not linked to a client")
        link = db.query(ClientContractorLink).filter(
            ClientContractorLink.client_id == current_user.client_id,
            ClientContractorLink.contractor_id == contractor_id,
            ClientContractorLink.status != ClientContractorStatus.INACTIVE,
        ).first()
        if not link:
            raise HTTPException(status_code=403, detail="Contractor is not linked to your client")
    # Contractors can only see their own users
    if current_user.role == UserRole.CONTRACTOR:
        q = q.filter(User.contractor_id == current_user.contractor_id)
    if current_user.role == UserRole.SUPERVISOR:
        q = q.filter(User.contractor_id == current_user.contractor_id)
        q = q.filter(User.role.in_([UserRole.SUPERVISOR, UserRole.WORKMAN]))
    return q.order_by(User.full_name).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role not in [UserRole.CLIENT, UserRole.CONTRACTOR]:
        raise HTTPException(status_code=403, detail="Access denied")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Access denied")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user
