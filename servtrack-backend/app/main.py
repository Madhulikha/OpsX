from pathlib import Path
import secrets

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.pii import (
    decrypt_pii,
    email_lookup_hash,
    encrypt_pii,
    is_encrypted,
    normalize_email,
    normalize_phone,
    phone_lookup_hash,
    validate_pii_key_configured,
)
from app.core.security import hash_password
from app.models.client import ClientAccount
from app.models.contractor import Contractor
from app.models.user import User, UserRole
from app.models.work_order import WorkOrderAttachment
from app.models import *  # noqa: F401,F403 — registers all models with SQLAlchemy

from app.routers import admin, auth, work_orders, contractors, users, notifications

# Tables are created via schema.sql run in Supabase SQL Editor.
# See README.md → Step 3.

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ServTrack API",
    description="Facility & Maintenance Management System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,          prefix="/api/v1")
app.include_router(admin.router,         prefix="/api/v1")
app.include_router(work_orders.router,   prefix="/api/v1")
app.include_router(contractors.router,   prefix="/api/v1")
app.include_router(users.router,         prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.on_event("startup")
def ensure_runtime_tables():
    validate_pii_key_configured()
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("alter type user_role add value if not exists 'superadmin'"))
        conn.execute(text("alter type wo_status add value if not exists 'rejected'"))
        conn.execute(text("alter table users add column if not exists end_user_code varchar(40)"))
        conn.execute(text("alter table users add column if not exists client_subrole varchar(50)"))
        conn.execute(text("alter table users add column if not exists email_lookup_hash varchar(64)"))
        conn.execute(text("alter table users add column if not exists phone_lookup_hash varchar(64)"))
        conn.execute(text("alter table users alter column phone type varchar(255)"))
        conn.execute(text("alter table users alter column full_name type text"))
        conn.execute(text("alter table users alter column email type text"))
        conn.execute(text("alter table users add column if not exists address_line1 text"))
        conn.execute(text("alter table users add column if not exists address_line2 text"))
        conn.execute(text("alter table users add column if not exists city text"))
        conn.execute(text("alter table users add column if not exists state text"))
        conn.execute(text("alter table users add column if not exists postal_code text"))
        conn.execute(text("alter table users add column if not exists country text"))
        conn.execute(text("alter table work_orders add column if not exists sub_category varchar(120)"))
        conn.execute(text("alter table work_orders add column if not exists preferred_visit_time varchar(80)"))
        conn.execute(text("alter table contracts add column if not exists client_id integer references clients(id) on delete cascade"))
        conn.execute(text(
            """
            update contracts c
            set client_id = l.client_id
            from client_contractor_links l
            where c.client_id is null
              and c.contractor_id = l.contractor_id
              and l.status != 'inactive'
              and not exists (
                  select 1
                  from client_contractor_links l2
                  where l2.contractor_id = c.contractor_id
                    and l2.status != 'inactive'
                    and l2.client_id != l.client_id
              )
            """
        ))
        conn.execute(text("alter table users add column if not exists otp_code varchar(255)"))
        conn.execute(text("alter table users alter column otp_code type varchar(255)"))
        conn.execute(text("alter table users add column if not exists otp_expires_at timestamptz"))
        conn.execute(text("create index if not exists idx_users_email_lookup_hash on users(email_lookup_hash)"))
        conn.execute(text("create index if not exists idx_users_phone_lookup_hash on users(phone_lookup_hash)"))
        conn.execute(text("create index if not exists idx_users_client_enduser_code on users(client_id, end_user_code)"))
        conn.execute(text(
            "create unique index if not exists uq_enduser_email_lookup_hash "
            "on users(email_lookup_hash) where role = 'enduser' and email_lookup_hash is not null"
        ))
        conn.execute(text(
            "create unique index if not exists uq_enduser_phone_lookup_hash "
            "on users(phone_lookup_hash) where role = 'enduser' and phone_lookup_hash is not null"
        ))
        conn.execute(text(
            "create unique index if not exists uq_enduser_client_code "
            "on users(client_id, end_user_code) where role = 'enduser' and end_user_code is not null"
        ))
        conn.execute(text("create index if not exists idx_users_client_role on users(client_id, role)"))
        conn.execute(text("create index if not exists idx_users_contractor_role on users(contractor_id, role)"))
        conn.execute(text("create index if not exists idx_contracts_client_contractor on contracts(client_id, contractor_id)"))
        conn.execute(text("create index if not exists idx_contracts_client_status on contracts(client_id, status)"))
        conn.execute(text("create index if not exists idx_wo_client_status on work_orders(client_id, status)"))
        conn.execute(text("create index if not exists idx_wo_contractor_status on work_orders(contractor_id, status)"))
        conn.execute(text("create index if not exists idx_wo_supervisor_status on work_orders(supervisor_id, status)"))
        conn.execute(text("create index if not exists idx_wo_workman_status on work_orders(workman_id, status)"))
        conn.execute(text("create index if not exists idx_wo_raised_by on work_orders(raised_by_id)"))
        conn.execute(text("create sequence if not exists work_order_ref_seq"))
        conn.execute(text(
            """
            select setval(
                'work_order_ref_seq',
                greatest(
                    coalesce((select max((regexp_match(ref_number, '^WO-([0-9]+)$'))[1]::integer) from work_orders where ref_number ~ '^WO-[0-9]+$'), 0),
                    coalesce((select max(id) from work_orders), 0)
                ) + 1,
                false
            )
            """
        ))
    WorkOrderAttachment.__table__.create(bind=engine, checkfirst=True)
    migrate_enduser_pii()
    if settings.APP_ENV == "development":
        ensure_development_accounts()


def prepare_enduser_pii(
    user: User,
    *,
    email: str | None = None,
    full_name: str | None = None,
    phone: str | None = None,
    address_line1: str | None = None,
    address_line2: str | None = None,
    city: str | None = None,
    state: str | None = None,
    postal_code: str | None = None,
    country: str | None = None,
) -> None:
    plain_email = normalize_email(email if email is not None else decrypt_pii(user.email))
    plain_name = full_name if full_name is not None else decrypt_pii(user.full_name)
    plain_phone = normalize_phone(phone if phone is not None else decrypt_pii(user.phone))

    user.email = encrypt_pii(plain_email)
    user.full_name = encrypt_pii(plain_name)
    user.phone = encrypt_pii(plain_phone)
    user.address_line1 = encrypt_pii(address_line1 if address_line1 is not None else decrypt_pii(user.address_line1))
    user.address_line2 = encrypt_pii(address_line2 if address_line2 is not None else decrypt_pii(user.address_line2))
    user.city = encrypt_pii(city if city is not None else decrypt_pii(user.city))
    user.state = encrypt_pii(state if state is not None else decrypt_pii(user.state))
    user.postal_code = encrypt_pii(postal_code if postal_code is not None else decrypt_pii(user.postal_code))
    user.country = encrypt_pii(country if country is not None else decrypt_pii(user.country))
    user.email_lookup_hash = email_lookup_hash(plain_email)
    user.phone_lookup_hash = phone_lookup_hash(plain_phone)


def migrate_enduser_pii():
    db = SessionLocal()
    try:
        changed = False
        users = db.query(User).filter(User.role == UserRole.ENDUSER).all()
        for user in users:
            needs_encryption = (
                not is_encrypted(user.email)
                or not is_encrypted(user.full_name)
                or (user.phone and not is_encrypted(user.phone))
                or (user.address_line1 and not is_encrypted(user.address_line1))
                or (user.address_line2 and not is_encrypted(user.address_line2))
                or (user.city and not is_encrypted(user.city))
                or (user.state and not is_encrypted(user.state))
                or (user.postal_code and not is_encrypted(user.postal_code))
                or (user.country and not is_encrypted(user.country))
            )
            if needs_encryption:
                prepare_enduser_pii(user)
                changed = True
            elif not user.email_lookup_hash or (user.phone and not user.phone_lookup_hash):
                user.email_lookup_hash = email_lookup_hash(decrypt_pii(user.email))
                user.phone_lookup_hash = phone_lookup_hash(decrypt_pii(user.phone))
                changed = True
            if not user.end_user_code:
                user.end_user_code = f"EU-{user.id}"
                changed = True
        if changed:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_development_accounts():
    db = SessionLocal()
    try:
        property_client = db.query(ClientAccount).filter(ClientAccount.name == "Property Client").first()
        alphaserv = db.query(Contractor).filter(Contractor.name == "AlphaServ").first()

        def upsert_user(email: str, full_name: str, password: str, role: UserRole, **attrs):
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(email=email, full_name=full_name, role=role, hashed_password=hash_password(password))
                db.add(user)
            user.full_name = full_name
            user.hashed_password = hash_password(password)
            user.role = role
            user.is_active = True
            for key, value in attrs.items():
                setattr(user, key, value)

        upsert_user("owner@servtrack.in", "ServTrack Owner", "Owner@1234", UserRole.SUPERADMIN)
        if property_client:
            upsert_user(
                "admin@propertyclient.in",
                "Vikram Mehta",
                "Admin@1234",
                UserRole.CLIENT,
                client_id=property_client.id,
                contractor_id=None,
                client_subrole="junior_engineer",
            )
            upsert_user(
                "assistant@propertyclient.in",
                "Nisha Menon",
                "Admin@1234",
                UserRole.CLIENT,
                client_id=property_client.id,
                client_subrole="assistant_engineer",
            )
            upsert_user(
                "commandant@propertyclient.in",
                "Arun Prakash",
                "Admin@1234",
                UserRole.CLIENT,
                client_id=property_client.id,
                client_subrole="commandant_engineer",
            )
            enduser_email = "security@property.in"
            enduser = db.query(User).filter(
                User.role == UserRole.ENDUSER,
                User.email_lookup_hash == email_lookup_hash(enduser_email),
            ).first()
            if not enduser:
                enduser = User(
                    email=enduser_email,
                    full_name="Ganesh Kumar",
                    role=UserRole.ENDUSER,
                    hashed_password=hash_password(f"otp-only-{secrets.token_urlsafe(32)}"),
                    client_id=property_client.id,
                )
                db.add(enduser)
            enduser.role = UserRole.ENDUSER
            enduser.client_id = property_client.id
            enduser.contractor_id = None
            enduser.client_subrole = None
            enduser.is_active = True
            prepare_enduser_pii(
                enduser,
                email=enduser_email,
                full_name="Ganesh Kumar",
                phone="+919876543210",
                address_line1="Tower A, Lobby Desk",
                address_line2="Green Meadows Apartments",
                city="Hyderabad",
                state="Telangana",
                postal_code="500081",
                country="India",
            )
            enduser.end_user_code = enduser.end_user_code or "EU-DEMO-001"
        if alphaserv:
            upsert_user(
                "manager@alphaserv.in",
                "Ravi Nair",
                "Contractor@1234",
                UserRole.CONTRACTOR,
                client_id=None,
                contractor_id=alphaserv.id,
                client_subrole=None,
            )
            upsert_user(
                "ramesh@alphaserv.in",
                "Ramesh Kumar",
                "Super@1234",
                UserRole.SUPERVISOR,
                client_id=None,
                contractor_id=alphaserv.id,
                client_subrole=None,
            )
            upsert_user(
                "suresh@alphaserv.in",
                "Suresh Pillai",
                "Work@1234",
                UserRole.WORKMAN,
                client_id=None,
                contractor_id=alphaserv.id,
                client_subrole=None,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
