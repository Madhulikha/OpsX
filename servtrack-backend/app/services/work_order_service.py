"""
Work Order Service
------------------
All business logic lives here, not in the router.
Routers only handle HTTP; services handle domain rules.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import HTTPException, status
from sqlalchemy import extract, func, text
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
    next_value = db.execute(text("select nextval('work_order_ref_seq')")).scalar()
    return f"WO-{int(next_value):04d}"


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
    if user.role == UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Super admins use aggregate admin endpoints only")
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

_PRIORITY_DUE_HOURS = {"High": 15 * 24, "Med": 72, "Low": 48}

def _auto_due_date(priority, due_date_override=None):
    """Return auto-calculated due date from priority unless one is provided or priority is Major."""
    from datetime import timedelta
    if due_date_override:
        return due_date_override
    hours = _PRIORITY_DUE_HOURS.get(priority.value if hasattr(priority, "value") else priority)
    if hours is None:
        return None
    return datetime.now(timezone.utc) + timedelta(hours=hours)

def create_work_order(db: Session, data: WorkOrderCreate, current_user: User) -> WorkOrder:
    if current_user.role not in [UserRole.CLIENT, UserRole.ENDUSER]:
        raise HTTPException(status_code=403, detail="Only client engineers and end users can raise service requests")
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
        due_date=_auto_due_date(data.priority, data.due_date),
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
        if wo.status != WOStatus.OPEN:
            raise HTTPException(
                status_code=403,
                detail="Service request details cannot be changed once it has been assigned to a contractor",
            )
        allowed_fields = {
            "title", "category", "sub_category", "area",
            "priority", "due_date", "contractor_id",
        }
    elif current_user.role == UserRole.CONTRACTOR:
        if wo.contractor_id != current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Cannot update work orders outside your contractor scope")
        if wo.status not in [WOStatus.OPEN, WOStatus.ASSIGNED]:
            raise HTTPException(
                status_code=403,
                detail="Service request details cannot be changed at this stage",
            )
        allowed_fields = {
            "supervisor_id", "workman_id", "due_date",
        }
    elif current_user.role == UserRole.SUPERVISOR:
        if wo.contractor_id != current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Cannot update work orders outside your contractor scope")
        if wo.supervisor_id not in [None, current_user.id]:
            raise HTTPException(status_code=403, detail="This work order belongs to another supervisor")
        if wo.status not in [WOStatus.ASSIGNED, WOStatus.INPROGRESS]:
            raise HTTPException(
                status_code=403,
                detail="Workman and due date can only be changed before completion is submitted for QC",
            )
        allowed_fields = {"workman_id", "due_date"}
    elif current_user.role == UserRole.ENDUSER:
        if wo.raised_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot update another user's request")
        if wo.status not in [WOStatus.OPEN, WOStatus.REJECTED]:
            raise HTTPException(status_code=403, detail="You can only update your request while it is open or after it has been rejected")
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
        if wo.status != WOStatus.OPEN and wo.workman_id != updates["workman_id"]:
            _notify(db, updates["workman_id"], f"Work assigned — {wo.ref_number}", wo.title, "info", wo.id)

    if "contractor_id" in updates:
        _validate_client_contractor_link(db, wo.client_id, updates["contractor_id"])

    for field, value in updates.items():
        setattr(wo, field, value)

    promoted_to_assigned = False
    if (
        current_user.role == UserRole.CONTRACTOR
        and wo.status == WOStatus.OPEN
        and wo.contractor_id
        and (wo.supervisor_id or wo.workman_id)
    ):
        wo.status = WOStatus.ASSIGNED
        promoted_to_assigned = True
        if wo.workman_id:
            _notify(db, wo.workman_id, f"Work assigned — {wo.ref_number}", wo.title, "info", wo.id)
        if wo.supervisor_id:
            _notify(db, wo.supervisor_id, f"Team assignment ready — {wo.ref_number}", wo.title, "info", wo.id)
        _notify(db, wo.raised_by_id, f"Request assigned — {wo.ref_number}", wo.title, "info", wo.id)

    if current_user.role == UserRole.CLIENT and "contractor_id" in updates and updates["contractor_id"]:
        _notify_contractor_users(db, wo, "Work order assigned", wo.ref_number)

    _log_activity(
        db, wo.id, current_user.id,
        action="Team assignment completed" if promoted_to_assigned else "Team assignment updated" if {"supervisor_id", "workman_id"} & set(updates.keys()) else "Work order details updated",
        note=", ".join(sorted(updates.keys())),
        from_status=WOStatus.OPEN if promoted_to_assigned else None,
        to_status=WOStatus.ASSIGNED if promoted_to_assigned else None,
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
        if new_status == "assigned" and not wo.contractor_id:
            raise HTTPException(status_code=422, detail="Select a linked contractor before assigning this request")

    if old_status == "pending" and current_user.role == UserRole.CLIENT and wo.raised_by_user and wo.raised_by_user.role == UserRole.ENDUSER:
        raise HTTPException(status_code=403, detail="This request is pending approval from the end user who raised it")

    if old_status == "pending" and current_user.role == UserRole.ENDUSER and wo.raised_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the requester can approve or reject this completed work")

    if not can_transition(old_status, new_status, current_user.role.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Role '{current_user.role.value}' cannot move WO from '{old_status}' to '{new_status}'",
        )

    if current_user.role == UserRole.WORKMAN and new_status == "inprogress" and wo.workman_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned workman can start this work order")

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
        "pending":    "QC passed — pending final approval",
        "closed":     "Approved and closed",
        "inprogress_from_pending": "Rejected — rework required",
        "inprogress_from_qc": "QC rejected — rework required",
        "escalated":  "Auto-escalated: SLA breached",
    }
    if new_status == "inprogress" and old_status == "pending":
        action_key = "inprogress_from_pending"
    elif new_status == "inprogress" and old_status == "qc":
        action_key = "inprogress_from_qc"
    else:
        action_key = new_status
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
        if wo.raised_by_user and wo.raised_by_user.role == UserRole.ENDUSER:
            _notify(db, wo.raised_by_id, f"Work ready for your approval — {ref}", wo.title, "warning", wo.id)
        else:
            _notify_client_users(db, f"Approval required — {ref}", wo.title, "warning", wo.client_id, wo.id)

    elif new_status == "qc":
        if wo.supervisor_id:
            _notify(db, wo.supervisor_id, f"Completion submitted — {ref}", wo.title, "warning", wo.id)

    elif new_status == "closed":
        _notify(db, wo.raised_by_id, f"WO Closed — {ref}", wo.title, "success", wo.id)
        _notify_client_users(db, f"Request closed — {ref}", wo.title, "success", wo.client_id, wo.id)

    elif new_status == "inprogress" and old_status == "pending":
        _notify_contractor_users(db, wo, f"WO Rejected — rework required — {ref}", wo.title)

    elif new_status == "inprogress" and old_status == "qc":
        if wo.workman_id:
            _notify(db, wo.workman_id, f"QC rejected — rework required — {ref}", wo.title, "warning", wo.id)
        _notify_contractor_users(db, wo, f"QC rejected — rework required — {ref}", wo.title)

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
    if current_user.role == UserRole.ENDUSER:
        if wo.raised_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the requester can add details")
        if wo.status not in [WOStatus.OPEN, WOStatus.REJECTED]:
            raise HTTPException(status_code=422, detail="Details can only be added while the request is open or after rejection")
        wo.description = f"{wo.description or ''}\n\nAdditional details (requester): {note}".strip()
        old_status = wo.status.value
        if wo.status == WOStatus.REJECTED:
            wo.status = WOStatus.OPEN
            _notify_client_subrole(
                db, f"Updated request ready for review — {wo.ref_number}",
                wo.title, "warning", wo.client_id, "junior_engineer", wo.id,
            )
        action = "Additional details added by requester"

    elif current_user.role == UserRole.CLIENT:
        if current_user.client_id != wo.client_id:
            raise HTTPException(status_code=403, detail="Cannot add notes to work orders outside your client scope")
        if wo.status == WOStatus.CLOSED:
            raise HTTPException(status_code=422, detail="Cannot add notes to a closed request")
        old_status = wo.status.value
        wo.description = f"{wo.description or ''}\n\nEngineer note ({current_user.full_name}): {note}".strip()
        action = "Engineer note added"

    elif current_user.role in [UserRole.SUPERVISOR, UserRole.CONTRACTOR]:
        if wo.status == WOStatus.CLOSED:
            raise HTTPException(status_code=422, detail="Cannot add notes to a closed request")
        if current_user.role == UserRole.SUPERVISOR and wo.supervisor_id != current_user.id:
            # Allow contractor supervisors to note on their contractor's work orders
            if wo.contractor_id != current_user.contractor_id:
                raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == UserRole.CONTRACTOR and wo.contractor_id != current_user.contractor_id:
            raise HTTPException(status_code=403, detail="Access denied")
        old_status = wo.status.value
        role_label = "Supervisor" if current_user.role == UserRole.SUPERVISOR else "Contractor"
        wo.description = f"{wo.description or ''}\n\n{role_label} note ({current_user.full_name}): {note}".strip()
        action = f"{role_label} note added"

    else:
        raise HTTPException(status_code=403, detail="Only the requester or an engineer can add details")

    _log_activity(db, wo.id, current_user.id, action, note=note, from_status=old_status, to_status=wo.status.value)
    db.commit()
    db.refresh(wo)
    return wo


def complete_work_with_photos(
    db: Session,
    wo_id: int,
    current_user: User,
    note: Optional[str] = None,
) -> WorkOrder:
    wo = get_work_order_by_id(db, wo_id, current_user)
    if current_user.role != UserRole.WORKMAN:
        raise HTTPException(status_code=403, detail="Only assigned workmen can complete work")
    if wo.workman_id != current_user.id:
        raise HTTPException(status_code=403, detail="This task is assigned to another workman")
    if wo.status != WOStatus.INPROGRESS:
        raise HTTPException(status_code=422, detail="Only in-progress work can be completed")

    old_status = wo.status.value
    wo.status = WOStatus.QC
    _log_activity(
        db, wo.id, current_user.id,
        action="Work completed — pending supervisor approval",
        note=note or "Completion photos uploaded",
        from_status=old_status,
        to_status=WOStatus.QC,
    )
    _fire_transition_notifications(db, wo, old_status, "qc", current_user)
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
