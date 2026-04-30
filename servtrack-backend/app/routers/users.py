import csv
import io
import random
import re
import string
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.core.security import hash_password
from app.models.client import ClientContractorLink, ClientContractorStatus
from app.models.contractor import Contractor
from app.models.user import User, UserRole
from app.schemas.user import ContractorUserInviteRequest, UserOut, UserUpdate
from app.services.email_service import build_contractor_user_invite_url, send_contractor_user_invite

router = APIRouter(prefix="/users", tags=["Users"])


def normalise_phone(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = "".join(ch for ch in value.strip() if ch.isdigit() or ch == "+")
    return cleaned or None


def looks_like_email(value: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value))


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
    Required columns: name, email
    Optional columns: phone
    Returns created users with their temporary passwords.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only .csv files are accepted")
    if current_user.client_id is None:
        raise HTTPException(status_code=422, detail="Your account is not linked to a client")

    content = await file.read()
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse CSV file")

    required = {"name", "email"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise HTTPException(status_code=422, detail="CSV must have columns: name, email (optional: phone)")

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
        email = row.get("email", "").lower()
        name = row.get("name", "")
        phone = normalise_phone(row.get("phone", ""))
        if not email or not name:
            skipped.append({"row": row, "reason": "Missing name or email"})
            continue
        if not looks_like_email(email):
            skipped.append({"email": email, "reason": "Invalid email"})
            continue
        if db.query(User).filter(User.email == email).first():
            skipped.append({"email": email, "reason": "Email already registered"})
            continue
        if phone and db.query(User).filter(User.phone == phone).first():
            skipped.append({"email": email, "reason": "Phone number already registered"})
            continue
        temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
        user = User(
            email=email,
            full_name=name,
            hashed_password=hash_password(temp_password),
            role=UserRole.ENDUSER,
            phone=phone,
            client_id=current_user.client_id,
        )
        db.add(user)
        created.append({"name": name, "email": email, "phone": phone})

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
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user
