import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.pii import decrypt_pii, email_lookup_hash, normalize_email, normalize_phone, phone_lookup_hash
from app.core.security import hash_password, verify_password, create_access_token, decode_token
from app.models.contractor import Contractor
from app.models.user import User, UserRole
from app.schemas.user import InviteAcceptRequest, LoginRequest, OtpRequest, OtpRequestResponse, OtpVerify, TokenResponse, UserCreate, UserOut
from app.services.email_service import (
    check_twilio_phone_verification,
    send_enduser_otp,
    start_twilio_phone_verification,
    twilio_verify_configured,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


def normalise_identifier(identifier: str) -> str:
    value = identifier.strip().lower()
    if "@" in value:
        return normalize_email(value)
    return normalize_phone(value) or value


def find_enduser_by_identifier(identifier: str, db: Session) -> User | None:
    value = normalise_identifier(identifier)
    if "@" in value:
        return db.query(User).filter(
            User.role == UserRole.ENDUSER,
            User.email_lookup_hash == email_lookup_hash(value),
        ).first()

    matches = db.query(User).filter(
        User.role == UserRole.ENDUSER,
        User.phone_lookup_hash == phone_lookup_hash(value),
    ).all()
    if len(matches) > 1:
        raise HTTPException(
            status_code=409,
            detail="More than one account uses this phone number. Please sign in with email or contact your client admin.",
        )
    return matches[0] if matches else None


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if user.role == UserRole.ENDUSER:
        raise HTTPException(status_code=403, detail="End users sign in with OTP only")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if payload.role == UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Super admin accounts must be created directly by the app owner")
    if settings.APP_ENV != "development":
        raise HTTPException(status_code=403, detail="Public registration is disabled")
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
    if not invite or invite.get("token_type") not in ["contractor_invite", "contractor_user_invite", "client_invite"]:
        raise HTTPException(status_code=400, detail="Invite link is invalid or expired")

    email = invite.get("email") or invite.get("sub")
    if invite.get("token_type") == "client_invite":
        client_id = invite.get("client_id")
        if not email or not client_id:
            raise HTTPException(status_code=400, detail="Invite link is missing client details")
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            email=email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            role=UserRole.CLIENT,
            phone=payload.phone,
            client_id=client_id,
            client_subrole=invite.get("client_subrole") or "commandant_engineer",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token({"sub": str(user.id), "role": user.role.value})
        return TokenResponse(access_token=token, user=UserOut.model_validate(user))

    contractor_id = invite.get("contractor_id")
    invite_role = invite.get("invite_role") or UserRole.CONTRACTOR.value
    if not email or not contractor_id:
        raise HTTPException(status_code=400, detail="Invite link is missing contractor details")
    if invite_role not in [UserRole.CONTRACTOR.value, UserRole.SUPERVISOR.value, UserRole.WORKMAN.value]:
        raise HTTPException(status_code=400, detail="Invite link has an invalid role")

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
        role=UserRole(invite_role),
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


@router.post("/request-otp", response_model=OtpRequestResponse)
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    identifier = normalise_identifier(payload.identifier)
    user = find_enduser_by_identifier(identifier, db)

    if not user:
        return OtpRequestResponse(
            success=False,
            message="We could not find your account. Please contact your facility administrator."
        )

    if not user.is_active:
        return OtpRequestResponse(
            success=False,
            message="Your account is deactivated. Please contact your facility administrator."
        )

    if user.role != UserRole.ENDUSER:
        return OtpRequestResponse(
            success=False,
            message="OTP login is only for end users."
        )

    # Only Twilio Verify path (NO DB OTP)
    if "@" not in identifier and twilio_verify_configured():
        if not user.phone:
            raise HTTPException(
                status_code=422,
                detail="This account does not have a registered phone number"
            )

        sent, reason = start_twilio_phone_verification(
            decrypt_pii(user.phone)
        )

        if not sent:
            return OtpRequestResponse(
                success=False,
                message="OTP could not be sent via Twilio. Please try again later."
            )

        return OtpRequestResponse(
            success=True,
            message="OTP sent to your registered phone."
        )

    # If Twilio not configured → fallback (optional email OTP if you want)
    return OtpRequestResponse(
        success=False,
        message="OTP service is not configured."
    )


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    identifier = normalise_identifier(payload.identifier)
    user = find_enduser_by_identifier(identifier, db)

    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    if user.role != UserRole.ENDUSER:
        raise HTTPException(status_code=404, detail="Account not found")

    if not user.phone:
        raise HTTPException(
            status_code=422,
            detail="No phone number registered"
        )

    # Twilio Verify validation ONLY
    ok = check_twilio_phone_verification(
        decrypt_pii(user.phone),
        payload.otp_code.strip()
    )

    if not ok:
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # Success → issue JWT
    token = create_access_token({
        "sub": str(user.id),
        "role": user.role.value
    })

    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user)
    )