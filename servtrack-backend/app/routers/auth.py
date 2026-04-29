from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password, create_access_token, decode_token
from app.models.contractor import Contractor
from app.models.user import User, UserRole
from app.schemas.user import InviteAcceptRequest, LoginRequest, TokenResponse, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        contractor_id=payload.contractor_id,
        client_id=payload.client_id,
        client_subrole=payload.client_subrole.value if payload.client_subrole else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/accept-invite", response_model=TokenResponse, status_code=201)
def accept_invite(payload: InviteAcceptRequest, db: Session = Depends(get_db)):
    invite = decode_token(payload.token)
    if not invite or invite.get("token_type") != "contractor_invite":
        raise HTTPException(status_code=400, detail="Invite link is invalid or expired")

    email = invite.get("email") or invite.get("sub")
    contractor_id = invite.get("contractor_id")
    if not email or not contractor_id:
        raise HTTPException(status_code=400, detail="Invite link is missing contractor details")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    contractor = db.query(Contractor).filter(
        Contractor.id == contractor_id,
        Contractor.is_active == True,
    ).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    user = User(
        email=email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.CONTRACTOR,
        phone=payload.phone,
        contractor_id=contractor.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
