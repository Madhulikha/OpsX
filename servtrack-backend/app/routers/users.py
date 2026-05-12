import csv
import io
import re
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.core.pii import (
    email_lookup_hash,
    encrypt_pii,
    normalize_email,
    normalize_phone,
    phone_lookup_hash,
)
from app.core.security import hash_password
from app.models.client import ClientContractorLink, ClientContractorStatus
from app.models.contractor import Contractor
from app.models.user import ClientSubRole, User, UserRole
from app.schemas.user import ClientEngineerInviteRequest, ContractorUserInviteRequest, UserOut, UserUpdate
from app.services.email_service import (
    build_client_invite_url,
    build_contractor_user_invite_url,
    send_client_invite,
    send_contractor_user_invite,
)

router = APIRouter(prefix="/users", tags=["Users"])


def normalise_phone(value: str | None) -> str | None:
    return normalize_phone(value)


def otp_only_password() -> str:
    return f"otp-only-{secrets.token_urlsafe(32)}"


def looks_like_email(value: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value))


def require_commandant_engineer(current_user: User) -> None:
    if current_user.role != UserRole.CLIENT or current_user.client_subrole != "commandant_engineer":
        raise HTTPException(status_code=403, detail="Only commandant engineers can manage end users")


@router.get("/", response_model=List[UserOut])
def list_users(
    role: Optional[str] = Query(None),
    contractor_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT, UserRole.CONTRACTOR, UserRole.SUPERVISOR)),
):
    q = db.query(User).filter(User.is_active == True)
    if current_user.role == UserRole.CLIENT and not contractor_id:
        if current_user.client_id is None:
            raise HTTPException(status_code=422, detail="Your account is not linked to a client")
        q = q.filter(User.client_id == current_user.client_id)
    if role:
        q = q.filter(User.role == role)
        if role == UserRole.ENDUSER.value and current_user.role == UserRole.CLIENT:
            require_commandant_engineer(current_user)
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
    users = q.order_by(User.id.desc() if role == UserRole.ENDUSER.value else User.full_name).all()
    if role == UserRole.ENDUSER.value:
        return [
            {
                "id": user.id,
                "email": "",
                "full_name": "Registered end user",
                "role": user.role,
                "end_user_code": user.end_user_code,
                "phone": None,
                "address_line1": None,
                "address_line2": None,
                "city": None,
                "state": None,
                "postal_code": None,
                "country": None,
                "contractor_id": user.contractor_id,
                "client_id": user.client_id,
                "client_subrole": user.client_subrole,
                "is_active": user.is_active,
                "created_at": user.created_at,
            }
            for user in users
        ]
    return users


@router.post("/invite-contractor-user")
def invite_contractor_user(
    payload: ContractorUserInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CONTRACTOR)),
):
    if not current_user.contractor_id:
        raise HTTPException(status_code=422, detail="Your account is not linked to a contractor")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    contractor = db.query(Contractor).filter(
        Contractor.id == current_user.contractor_id,
        Contractor.is_active == True,
    ).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    invite_url = build_contractor_user_invite_url(payload.email, contractor, payload.role.value)
    invite_sent = send_contractor_user_invite(payload.email, contractor, payload.role.value, current_user, invite_url)
    return {
        "email": payload.email,
        "role": payload.role.value,
        "invite_sent": invite_sent,
        "invite_url": None if invite_sent else invite_url,
    }


@router.post("/invite-client-engineer")
def invite_client_engineer(
    payload: ClientEngineerInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
):
    require_commandant_engineer(current_user)
    if current_user.client_id is None:
        raise HTTPException(status_code=422, detail="Your account is not linked to a client")

    email = payload.email.lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if existing.role == UserRole.CLIENT and existing.client_id == current_user.client_id:
            raise HTTPException(status_code=409, detail="This engineer is already registered for your client")
        raise HTTPException(status_code=409, detail="Email already registered")

    invite_url = build_client_invite_url(
        email,
        current_user.client_id,
        current_user.client_account.name if current_user.client_account else "your client",
        payload.full_name.strip(),
        payload.client_subrole.value,
    )
    role_label = "junior engineer" if payload.client_subrole == ClientSubRole.JUNIOR_ENGINEER else "assistant engineer"
    invite_sent = send_client_invite(
        email,
        current_user.client_account.name if current_user.client_account else "your client",
        current_user,
        invite_url,
        role_label,
    )
    return {
        "email": email,
        "full_name": payload.full_name.strip(),
        "client_subrole": payload.client_subrole.value,
        "invite_sent": invite_sent,
        "invite_url": None if invite_sent else invite_url,
    }


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

@router.post("/bulk-endusers")
async def bulk_create_endusers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CLIENT)),
) -> Dict[str, Any]:
    """
    Upload a CSV to bulk-create end users.
    Required columns: id, name, email
    Optional columns: phone, address_line1, address_line2, city, state, postal_code, country
    Returns created users. End users are OTP-only and do not receive passwords.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only .csv files are accepted")
    require_commandant_engineer(current_user)
    if current_user.client_id is None:
        raise HTTPException(status_code=422, detail="Your account is not linked to a client")

    content = await file.read()
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse CSV file")

    required = {"id", "name", "email"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise HTTPException(
            status_code=422,
            detail="CSV must have columns: id, name, email (optional: phone, address_line1, address_line2, city, state, postal_code, country)",
        )

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=422, detail="CSV file is empty")
    if len(rows) > 200:
        raise HTTPException(status_code=422, detail="Maximum 200 users per upload")

    # Normalise headers
    normalised = []
    for row in rows:
        normalised.append({k.strip().lower(): (v or '').strip() for k, v in row.items()})

    created = []
    skipped = []
    for row in normalised:
        end_user_code = row.get("id", "").strip()
        email = normalize_email(row.get("email", ""))
        name = row.get("name", "")
        phone = normalise_phone(row.get("phone", ""))
        address_line1 = row.get("address_line1", "")
        address_line2 = row.get("address_line2", "")
        city = row.get("city", "")
        state = row.get("state", "")
        postal_code = row.get("postal_code", "")
        country = row.get("country", "") or "India"
        if not end_user_code or not email or not name:
            skipped.append({"row": row, "reason": "Missing id, name, or email"})
            continue
        if not looks_like_email(email):
            skipped.append({"email": email, "reason": "Invalid email"})
            continue
        if db.query(User).filter(
            User.role == UserRole.ENDUSER,
            User.client_id == current_user.client_id,
            User.end_user_code == end_user_code,
        ).first():
            skipped.append({"id": end_user_code, "email": email, "reason": "End user ID already exists"})
            continue
        email_hash = email_lookup_hash(email)
        phone_hash = phone_lookup_hash(phone)
        if db.query(User).filter(
            User.role == UserRole.ENDUSER,
            User.email_lookup_hash == email_hash,
        ).first() or db.query(User).filter(User.email == email).first():
            skipped.append({"email": email, "reason": "Email already registered"})
            continue
        if phone and db.query(User).filter(
            User.role == UserRole.ENDUSER,
            User.phone_lookup_hash == phone_hash,
        ).first():
            skipped.append({"email": email, "reason": "Phone number already registered"})
            continue
        user = User(
            email=encrypt_pii(email),
            full_name=encrypt_pii(name),
            hashed_password=hash_password(otp_only_password()),
            role=UserRole.ENDUSER,
            end_user_code=end_user_code,
            phone=encrypt_pii(phone),
            address_line1=encrypt_pii(address_line1),
            address_line2=encrypt_pii(address_line2),
            city=encrypt_pii(city),
            state=encrypt_pii(state),
            postal_code=encrypt_pii(postal_code),
            country=encrypt_pii(country),
            email_lookup_hash=email_hash,
            phone_lookup_hash=phone_hash,
            client_id=current_user.client_id,
        )
        db.add(user)
        created.append({
            "id": end_user_code,
            "name": name,
            "email": email,
            "phone": phone,
            "address_line1": address_line1,
            "address_line2": address_line2,
            "city": city,
            "state": state,
            "postal_code": postal_code,
            "country": country,
        })

    db.commit()
    return {"created": created, "skipped": skipped, "total_created": len(created), "total_skipped": len(skipped)}

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
    updates = payload.model_dump(exclude_unset=True)
    if user.role == UserRole.ENDUSER:
        if current_user.role == UserRole.CLIENT and current_user.client_id != user.client_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if "end_user_code" in updates:
            code = (updates.pop("end_user_code") or "").strip()
            if not code:
                raise HTTPException(status_code=422, detail="End user ID cannot be empty")
            duplicate = db.query(User).filter(
                User.role == UserRole.ENDUSER,
                User.client_id == user.client_id,
                User.end_user_code == code,
                User.id != user.id,
            ).first()
            if duplicate:
                raise HTTPException(status_code=409, detail="End user ID already exists")
            user.end_user_code = code
        if "full_name" in updates:
            user.full_name = encrypt_pii(updates.pop("full_name") or "")
        if "phone" in updates:
            phone = normalise_phone(updates.pop("phone"))
            user.phone = encrypt_pii(phone)
            user.phone_lookup_hash = phone_lookup_hash(phone)
        for field in ["address_line1", "address_line2", "city", "state", "postal_code", "country"]:
            if field in updates:
                setattr(user, field, encrypt_pii(updates.pop(field) or ""))
    for k, v in updates.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user
