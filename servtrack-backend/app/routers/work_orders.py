from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.work_order import (
    WorkOrderCreate, WorkOrderUpdate, WorkOrderOut, WorkOrderSummary,
    StatusTransitionRequest, DashboardStats,
)
from app.services import work_order_service as svc

router = APIRouter(prefix="/work-orders", tags=["Work Orders"])


# ── Dashboard stats ───────────────────────────────────────────────────────────

@router.get("/dashboard-stats", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.get_dashboard_stats(db, current_user)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[WorkOrderSummary])
def list_work_orders(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    contractor_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.get_work_orders(db, current_user, status, priority, contractor_id, search, skip, limit)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=WorkOrderOut, status_code=201)
def create_work_order(
    payload: WorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.create_work_order(db, payload, current_user)


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{wo_id}", response_model=WorkOrderOut)
def get_work_order(
    wo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.get_work_order_by_id(db, wo_id, current_user)


# ── Update details ────────────────────────────────────────────────────────────

@router.patch("/{wo_id}", response_model=WorkOrderOut)
def update_work_order(
    wo_id: int,
    payload: WorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.update_work_order(db, wo_id, payload, current_user)


# ── Status transition ─────────────────────────────────────────────────────────

@router.post("/{wo_id}/transition", response_model=WorkOrderOut)
def transition_status(
    wo_id: int,
    payload: StatusTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Single endpoint for ALL status changes.
    The service validates that the requesting role is
    allowed to make this particular transition.
    """
    return svc.transition_status(
        db, wo_id,
        new_status=payload.new_status.value,
        note=payload.note,
        current_user=current_user,
    )


# ── SLA escalation trigger (for cron / internal use) ─────────────────────────

@router.post("/internal/run-sla-escalation", include_in_schema=False)
def run_sla_escalation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Called by cron every 15 min. Requires CLIENT role as guard."""
    from app.models.user import UserRole
    if current_user.role != UserRole.CLIENT:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not allowed")
    count = svc.run_sla_escalation(db)
    return {"escalated": count}
