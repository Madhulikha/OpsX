from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
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


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "version": "1.0.0"}
