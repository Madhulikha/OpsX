from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.models.work_order import WorkOrderAttachment
from app.models import *  # noqa: F401,F403 — registers all models with SQLAlchemy

from app.routers import auth, work_orders, contractors, users, notifications

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router,          prefix="/api/v1")
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
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("alter type wo_status add value if not exists 'rejected'"))
        conn.execute(text("alter table users add column if not exists client_subrole varchar(50)"))
        conn.execute(text("alter table work_orders add column if not exists sub_category varchar(120)"))
        conn.execute(text("alter table work_orders add column if not exists preferred_visit_time varchar(80)"))
        conn.execute(text("alter table users add column if not exists otp_code varchar(255)"))
        conn.execute(text("alter table users alter column otp_code type varchar(255)"))
        conn.execute(text("alter table users add column if not exists otp_expires_at timestamptz"))
    WorkOrderAttachment.__table__.create(bind=engine, checkfirst=True)
