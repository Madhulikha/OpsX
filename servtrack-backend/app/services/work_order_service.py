"""
Work Order Service
------------------
All business logic lives here, not in the router.
Routers only handle HTTP; services handle domain rules.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import HTTPException, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.models.client import ClientContractorLink, ClientContractorStatus
from app.models.work_order import (
    WorkOrder, ActivityLog, Notification,
    WOStatus, can_transition,
)
from app.models.user import User, UserRole
from app.schemas.work_order import WorkOrderCreate, WorkOrderUpdate, DashboardStats


# ── Reference number generator ────────────────────────────────────────────────

def _next_ref(db: Session) -> str:
    count = db.query(func.count(WorkOrder.id)).scalar() or 0
    return f"WO-{count + 1:04d}"


# ── Notification helper ───────────────────────────────────────────────────────

def _notify(db: Session, user_id: int, title: str, body: str, notif_type: str,
            work_order_id: Optional[int] = None) -> None:
    n = Notification(
        user_id=user_id, title=title, body=body,
        notif_type=notif_type, work_order_id=work_order_id,
    )
    db.add(n)


def _notify_client_users(
    db: Session, title: str, body: str, notif_type: str,
    client_id: Optional[int],
    work_order_id: Optional[int] = None,
) -> None:
    if client_id is None:
        return
    clients = db.query(User).filter(
        User.role == UserRole.CLIENT,
        User.client_id == client_id,
        User.is_active == True,
    ).all()
    for client in clients:
        _notify(db, client.id, title, body, notif_type, work_order_id)


def _notify_client_subrole(
    db: Session, title: str, body: str, notif_type: str,
    client_id: Optional[int],
    subrole: str,
    work_order_id: Optional[int] = None,
) -> None:
    if client_id is None:
        return
    users = db.query(User).filter(
        User.role == UserRole.CLIENT,
        User.client_id == client_id,
        User.client_subrole == subrole,
        User.is_active == True,
    ).all()
    for user in users:
        _notify(db, user.id, title, body, notif_type, work_order_id)


def approval_stage_for(wo: WorkOrder) -> str:
    if wo.status == WOStatus.ESCALATED:
        return "commandant_engineer"
    if wo.status not in [WOStatus.OPEN, WOStatus.REJECTED]:
        return "none"

    created = wo.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
    if age_hours >= 48:
        return "commandant_engineer"
    if age_hours >= 24:
        return "assistant_engineer"
    return "junior_engineer"


def _ensure_client_can_approve(wo: WorkOrder, current_user: User) -> None:
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only client engineers can approve or reject requests")
    if current_user.client_id != wo.client_id:
        raise HTTPException(status_code=403, detail="Request belongs to another client")
    expected = approval_stage_for(wo)
    user_stage = current_user.client_subrole or "junior_engineer"
    if expected != "none" and user_stage != expected:
        raise HTTPException(status_code=403, detail=f"This request is currently with {expected.replace('_', ' ')}")


def _log_activity(
    db: Session, work_order_id: int, user_id: int,
    action: str, note: Optional[str] = None,
    from_status: Optional[str] = None, to_status: Optional[str] = None,
) -> ActivityLog:
    entry = ActivityLog(
        work_order_id=work_order_id, user_id=user_id,
        action=action, note=note,
        from_status=from_status, to_status=to_status,
    )
    db.add(entry)
    return entry


# ── Scope filtering by role ───────────────────────────────────────────────────

def _apply_role_scope(query, user: User):
    """Limit query to records the user should see."""
    if user.role == UserRole.CLIENT:
        query = query.filter(WorkOrder.client_id == user.client_id)
        subrole = user.client_subrole
        if subrole in ["junior_engineer", "assistant_engineer", "commandant_engineer"]:
            return query
        return query
    if user.role == UserRole.CONTRACTOR:
        return query.filter(WorkOrder.contractor_id == user.contractor_id)
    if user.role == UserRole.SUPERVISOR:
        return query.filter(WorkOrder.supervisor_id == user.id)
    if user.role == UserRole.WORKMAN:
        return query.filter(WorkOrder.workman_id == user.id)
    if user.role == UserRole.ENDUSER:
        return query.filter(WorkOrder.raised_by_id == user.id, WorkOrder.client_id == user.client_id)
    return query


def _validate_client_contractor_link(
    db: Session,
    client_id: Optional[int],
    contractor_id: Optional[int],
) -> None:
    if client_id is None or contractor_id is None:
        return

    link = db.query(ClientContractorLink).filter(
        ClientContractorLink.client_id == client_id,
        ClientContractorLink.contractor_id == contractor_id,
        ClientContractorLink.status != ClientContractorStatus.INACTIVE,
    ).first()
    if not link:
        raise HTTPException(status_code=422, detail="Selected contractor is not linked to this client")


# ── CRUD ─────────────────────────────────────────────────────────────────────

def get_work_orders(
    db: Session,
    current_user: User,
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    contractor_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> List[WorkOrder]:
    q = db.query(WorkOrder).options(
        joinedload(WorkOrder.raised_by_user),
        joinedload(WorkOrder.contractor),
        joinedload(WorkOrder.supervisor),
        joinedload(WorkOrder.workman),
        joinedload(WorkOrder.attachments),
    )
    q = _apply_role_scope(q, current_user)

    if status_filter:
        q = q.filter(WorkOrder.status == status_filter)
    if priority:
        q = q.filter(WorkOrder.priority == priority)
    if contractor_id:
        q = q.filter(WorkOrder.contractor_id == contractor_id)
    if search:
        q = q.filter(
            WorkOrder.title.ilike(f"%{search}%") |
            WorkOrder.area.ilike(f"%{search}%") |
            WorkOrder.ref_number.ilike(f"%{search}%")
        )

    return q.order_by(WorkOrder.created_at.desc()).offset(skip).limit(limit).all()


def get_work_order_by_id(db: Session, wo_id: int, current_user: User) -> WorkOrder:
    q = db.query(WorkOrder).options(
        joinedload(WorkOrder.raised_by_user),
        joinedload(WorkOrder.contractor),
        joinedload(WorkOrder.supervisor),
        joinedload(WorkOrder.workman),
        joinedload(WorkOrder.attachments),
        joinedload(WorkOrder.activity).joinedload(ActivityLog.user),
    ).filter(WorkOrder.id == wo_id)
    q = _apply_role_scope(q, current_user)
    wo = q.first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


def create_work_order(db: Session, data: WorkOrderCreate, current_user: User) -> WorkOrder:
    if current_user.role in [UserRole.CLIENT, UserRole.ENDUSER] and current_user.client_id is None:
        raise HTTPException(status_code=422, detail="Your account is not linked to a client")

    _validate_client_contractor_link(db, current_user.client_id, data.contractor_id)

    wo = WorkOrder(
        ref_number=_next_ref(db),
        raised_by_id=current_user.id,
        client_id=current_user.client_id,
        title=data.title,
        description=data.description,
        category=data.category,
        sub_category=data.sub_category,
        area=data.area,
        preferred_visit_time=data.preferred_visit_time,
        priority=data.priority,
        sla_hours=data.sla_hours,
        due_date=data.due_date,
        contractor_id=data.contractor_id,
        supervisor_id=data.supervisor_id,
        workman_id=data.workman_id,
        status=WOStatus.OPEN,
    )
    db.add(wo)
    db.flush()  # get the id before commit

    _log_activity(
        db, wo.id, current_user.id,
        action="Work order created",
        note=f"Raised by {current_user.full_name}",
        to_status=WOStatus.OPEN,
    )

    if current_user.role == UserRole.ENDUSER:
        _notify_client_users(
            db,
            title=f"New request raised — {wo.ref_number}",
            body=f"{current_user.full_name} raised: {wo.title}",
            notif_type="info",
            client_id=wo.client_id,
            work_order_id=wo.id,
        )
        _notify_client_subrole(
            db,
            title=f"Approval required — {wo.ref_number}",
            body=f"{current_user.full_name} raised: {wo.title}",
            notif_type="warning",
            client_id=wo.client_id,
            subrole="junior_engineer",
            work_order_id=wo.id,
        )
        _notify(
            db, current_user.id,
            title=f"Request submitted — {wo.ref_number}",
            body="Your request has been logged and is awaiting action.",
            notif_type="success",
            work_order_id=wo.id,
        )

    # Notify contractor if already assigned
    if wo.contractor_id:
        _notify_contractor_users(db, wo, "New work order assigned", wo.ref_number)

    db.commit()
    db.refresh(wo)
    return wo


def _notify_contractor_users(db: Session, wo: WorkOrder, title: str, ref: str) -> None:
    from app.models.user import User
    users = db.query(User).filter(
        User.contractor_id == wo.contractor_id,
        User.role.in_([UserRole.CONTRACTOR, UserRole.SUPERVISOR]),
        User.is_active == True,
    ).all()
    for u in users:
        _notify(db, u.id, f"{title} — {ref}", wo.title, "info", wo.id)


def update_work_order(
    db: Session, wo_id: int, data: WorkOrderUpdate, current_user: User
) -> WorkOrder:
    wo = get_work_order_by_id(db, wo_id, current_user)

    updates = data.model_dump(exclude_unset=True)

    if current_user.role == UserRole.CLIENT:
        allowed_fields = {
            "title", "description", "category", "sub_category", "area", "priority", "sla_hours",
            "due_date", "contractor_id", "supervisor_id", "workman_id",
        }
    elif current_user.role == UserRole.CONTRACTOR:
        allowed_fields = {
            "title", "description", "category", "area", "priority",
            "due_date", "supervisor_id", "workman_id",
        }
        if wo.contractor_id != current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Cannot update work orders outside your contractor scope")
    elif current_user.role == UserRole.SUPERVISOR:
        allowed_fields = {"workman_id", "due_date"}
        if wo.contractor_id != current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Cannot update work orders outside your contractor scope")
        if wo.supervisor_id not in [None, current_user.id]:
            raise HTTPException(status_code=403, detail="This work order belongs to another supervisor")
    elif current_user.role == UserRole.ENDUSER:
        if wo.raised_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot update another user's request")
        if not (wo.status == WOStatus.REJECTED or (wo.status == WOStatus.OPEN and wo.priority.value == "Low")):
            raise HTTPException(status_code=403, detail="Additional details are only allowed before approval for low priority requests or after rejection")
        allowed_fields = {"description"}
    else:
        raise HTTPException(status_code=403, detail="Not allowed to update work order details")

    disallowed = set(updates) - allowed_fields
    if disallowed:
        raise HTTPException(
            status_code=403,
            detail=f"Fields not allowed for your role: {sorted(disallowed)}",
        )

    if "supervisor_id" in updates and updates["supervisor_id"] is not None:
        supervisor = db.query(User).filter(
            User.id == updates["supervisor_id"],
            User.is_active == True,
        ).first()
        if not supervisor or supervisor.role != UserRole.SUPERVISOR:
            raise HTTPException(status_code=422, detail="Selected supervisor is invalid")
        if wo.contractor_id and supervisor.contractor_id != wo.contractor_id and updates.get("contractor_id", wo.contractor_id) != supervisor.contractor_id:
            raise HTTPException(status_code=422, detail="Supervisor must belong to the assigned contractor")

    if "workman_id" in updates and updates["workman_id"] is not None:
        workman = db.query(User).filter(
            User.id == updates["workman_id"],
            User.is_active == True,
        ).first()
        if not workman or workman.role != UserRole.WORKMAN:
            raise HTTPException(status_code=422, detail="Selected workman is invalid")
        expected_contractor_id = updates.get("contractor_id", wo.contractor_id)
        if expected_contractor_id and workman.contractor_id != expected_contractor_id:
            raise HTTPException(status_code=422, detail="Workman must belong to the assigned contractor")

    if "contractor_id" in updates:
        _validate_client_contractor_link(db, wo.client_id, updates["contractor_id"])

    for field, value in updates.items():
        setattr(wo, field, value)

    if current_user.role == UserRole.CLIENT and "contractor_id" in updates and updates["contractor_id"]:
        _notify_contractor_users(db, wo, "Work order assigned", wo.ref_number)

    _log_activity(
        db, wo.id, current_user.id,
        action="Work order details updated",
        note=", ".join(sorted(updates.keys())),
    )
    db.commit()
    db.refresh(wo)
    return wo


# ── Status transitions ────────────────────────────────────────────────────────

def transition_status(
    db: Session,
    wo_id: int,
    new_status: str,
    note: Optional[str],
    current_user: User,
) -> WorkOrder:
    wo = get_work_order_by_id(db, wo_id, current_user)
    old_status = wo.status.value

    # Validate transition
    if old_status == "open" and new_status in ["assigned", "rejected"]:
        _ensure_client_can_approve(wo, current_user)

    if not can_transition(old_status, new_status, current_user.role.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Role '{current_user.role.value}' cannot move WO from '{old_status}' to '{new_status}'",
        )

    wo.status = WOStatus(new_status)

    # Side-effects per transition
    if new_status == WOStatus.INPROGRESS and old_status == WOStatus.ASSIGNED:
        wo.started_at = datetime.now(timezone.utc)

    if new_status == WOStatus.CLOSED:
        wo.closed_at = datetime.now(timezone.utc)

    action_labels = {
        "assigned":   "Contractor assigned",
        "rejected":   "Request rejected by engineer",
        "inprogress": "Work started",
        "qc":         "Job done — submitted for QC",
        "pending":    "QC passed — pending client approval",
        "closed":     "Approved and closed",
        "inprogress_from_pending": "Rejected — rework required",
        "escalated":  "Auto-escalated: SLA breached",
    }
    action_key = new_status if new_status != "inprogress" or old_status != "pending" else "inprogress_from_pending"
    action = action_labels.get(action_key, f"Status changed to {new_status}")

    _log_activity(
        db, wo.id, current_user.id,
        action=action, note=note,
        from_status=old_status, to_status=new_status,
    )

    # Notify relevant parties
    _fire_transition_notifications(db, wo, old_status, new_status, current_user)

    db.commit()
    db.refresh(wo)
    return wo


def _fire_transition_notifications(
    db: Session, wo: WorkOrder, old_status: str, new_status: str, actor: User
) -> None:
    ref = wo.ref_number

    if new_status == "assigned":
        _notify_contractor_users(db, wo, f"New work order assigned — {ref}", wo.title)
        _notify(db, wo.raised_by_id, f"Request assigned — {ref}", wo.title, "info", wo.id)

    elif new_status == "inprogress" and old_status == "assigned":
        _notify(db, wo.raised_by_id, f"Work started — {ref}", wo.title, "info", wo.id)

    elif new_status == "pending":
        # Notify all client users
        _notify_client_users(db, f"Approval required — {ref}", wo.title, "warning", wo.client_id, wo.id)

    elif new_status == "closed":
        _notify(db, wo.raised_by_id, f"WO Closed — {ref}", wo.title, "success", wo.id)

    elif new_status == "inprogress" and old_status == "pending":
        # Rejected
        _notify_contractor_users(db, wo, f"WO Rejected — rework required — {ref}", wo.title)

    elif new_status == "rejected":
        _notify(db, wo.raised_by_id, f"Request rejected — {ref}", wo.title, "danger", wo.id)

    elif new_status == "escalated":
        _notify_client_users(db, f"SLA Breach — {ref}", f"Escalated: {wo.title}", "danger", wo.client_id, wo.id)


# ── SLA escalation (called by a scheduler) ───────────────────────────────────

def run_sla_escalation(db: Session) -> int:
    """
    Find all non-closed WOs where elapsed > sla_hours and not yet escalated.
    Mark them escalated and fire notifications.
    Call this from a cron job / APScheduler every 15 minutes.
    Returns count of newly escalated WOs.
    """
    now = datetime.now(timezone.utc)
    candidates = db.query(WorkOrder).filter(
        WorkOrder.status.notin_([WOStatus.CLOSED, WOStatus.ESCALATED]),
        WorkOrder.sla_breached == False,  # noqa: E712
    ).all()

    escalated_count = 0
    for wo in candidates:
        ref_time = wo.started_at or wo.created_at
        elapsed_h = (now - ref_time).total_seconds() / 3600
        if elapsed_h >= wo.sla_hours:
            old_status = wo.status.value
            wo.status = WOStatus.ESCALATED
            wo.sla_breached = True
            _log_activity(
                db, wo.id, None,
                action="Auto-escalated: SLA breached",
                note=f"Elapsed {elapsed_h:.1f}h vs {wo.sla_hours}h SLA",
                from_status=old_status,
                to_status=WOStatus.ESCALATED,
            )
            _fire_transition_notifications(db, wo, old_status, "escalated", None)
            escalated_count += 1

    if escalated_count:
        db.commit()
    return escalated_count


def request_user_escalation(db: Session, wo_id: int, current_user: User) -> WorkOrder:
    wo = get_work_order_by_id(db, wo_id, current_user)
    if current_user.role != UserRole.ENDUSER or wo.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the requester can escalate this request")
    if wo.status in [WOStatus.CLOSED, WOStatus.ESCALATED]:
        raise HTTPException(status_code=422, detail="This request cannot be escalated")

    created = wo.created_at if wo.created_at.tzinfo else wo.created_at.replace(tzinfo=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
    if age_hours < 4:
        raise HTTPException(status_code=422, detail="Requests can be escalated after 4 hours")

    old_status = wo.status.value
    wo.status = WOStatus.ESCALATED
    wo.sla_breached = True
    _log_activity(
        db, wo.id, current_user.id,
        action="Escalated by requester",
        note="No action after 4 hours",
        from_status=old_status,
        to_status=WOStatus.ESCALATED,
    )
    if wo.supervisor_id:
        _notify(db, wo.supervisor_id, f"Request escalated — {wo.ref_number}", wo.title, "danger", wo.id)
    _notify_client_subrole(db, f"Request escalated — {wo.ref_number}", wo.title, "danger", wo.client_id, "junior_engineer", wo.id)
    _notify_client_subrole(db, f"Request escalated — {wo.ref_number}", wo.title, "danger", wo.client_id, "commandant_engineer", wo.id)
    db.commit()
    db.refresh(wo)
    return wo


def add_request_details(db: Session, wo_id: int, note: str, current_user: User) -> WorkOrder:
    wo = get_work_order_by_id(db, wo_id, current_user)
    if current_user.role != UserRole.ENDUSER or wo.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the requester can add details")
    if not (wo.status == WOStatus.REJECTED or (wo.status == WOStatus.OPEN and wo.priority.value == "Low")):
        raise HTTPException(status_code=422, detail="Details can be added before junior approval for low priority requests or after rejection")
    wo.description = f"{wo.description or ''}\n\nAdditional details: {note}".strip()
    if wo.status == WOStatus.REJECTED:
        old_status = wo.status.value
        wo.status = WOStatus.OPEN
        _notify_client_subrole(db, f"Updated request ready for review — {wo.ref_number}", wo.title, "warning", wo.client_id, "junior_engineer", wo.id)
    else:
        old_status = wo.status.value
    _log_activity(db, wo.id, current_user.id, "Additional details added", note=note, from_status=old_status, to_status=wo.status.value)
    db.commit()
    db.refresh(wo)
    return wo


# ── Dashboard stats ───────────────────────────────────────────────────────────

def get_dashboard_stats(db: Session, current_user: User) -> DashboardStats:
    q = db.query(WorkOrder)
    q = _apply_role_scope(q, current_user)
    all_wos = q.all()

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year  = now.year

    open_wos     = [w for w in all_wos if w.status == WOStatus.OPEN]
    inprog_wos   = [w for w in all_wos if w.status == WOStatus.INPROGRESS]
    closed_month = [w for w in all_wos if w.status == WOStatus.CLOSED
                    and w.closed_at and w.closed_at.month == current_month
                    and w.closed_at.year == current_year]
    breaches     = [w for w in all_wos if w.sla_breached or w.status == WOStatus.ESCALATED]
    closed_all   = [w for w in all_wos if w.status == WOStatus.CLOSED]

    compliance   = 0.0
    if closed_all:
        on_time = [w for w in closed_all if not w.sla_breached]
        compliance = round(len(on_time) / len(closed_all) * 100, 1)

    avg_res = 0.0
    if closed_all:
        avg_res = round(sum(w.elapsed_hours for w in closed_all) / len(closed_all), 1)

    return DashboardStats(
        total_open=len(open_wos),
        total_inprogress=len(inprog_wos),
        total_closed_this_month=len(closed_month),
        sla_breaches=len(breaches),
        sla_compliance_pct=compliance,
        avg_resolution_hours=avg_res,
    )
