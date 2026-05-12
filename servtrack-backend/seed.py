"""
seed.py
-------
Inserts demo users and work orders into your Supabase database.

Run AFTER you have:
  1. Applied schema.sql in Supabase SQL Editor
  2. Filled in DATABASE_URL in your .env file

Usage:
    python seed.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta, timezone
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.contractor import Contractor
from app.models.client import ClientAccount, ClientContractorLink, ClientContractorStatus
from app.models.work_order import WorkOrder, ActivityLog, WOStatus, WOPriority, WOCategory

db = SessionLocal()


def already_seeded():
    return db.query(User).count() > 0


def seed():
    if already_seeded():
        print("Already seeded. Delete users manually in Supabase to re-seed.")
        return

    print("Seeding users and work orders into Supabase...")

    # Fetch contractors already inserted by schema.sql
    client_account = db.query(ClientAccount).filter(ClientAccount.name == "Property Client").first()
    alphaserv = db.query(Contractor).filter(Contractor.name == "AlphaServ").first()
    cooltech  = db.query(Contractor).filter(Contractor.name == "CoolTech").first()
    brightco  = db.query(Contractor).filter(Contractor.name == "BrightCo").first()
    hydrofix  = db.query(Contractor).filter(Contractor.name == "HydroFix").first()

    if not alphaserv:
        print()
        print("ERROR: Contractors not found in database.")
        print("Did you run schema.sql in the Supabase SQL Editor first?")
        print("  Supabase Dashboard -> SQL Editor -> New Query -> paste schema.sql -> Run")
        sys.exit(1)

    # Users
    superadmin = User(email="owner@servtrack.in", full_name="ServTrack Owner", hashed_password=hash_password("Owner@1234"), role=UserRole.SUPERADMIN)
    client_admin = User(email="admin@propertyclient.in",  full_name="Vikram Mehta",   hashed_password=hash_password("Admin@1234"),       role=UserRole.CLIENT, client_id=client_account.id, client_subrole="junior_engineer")
    assistant_engineer = User(email="assistant@propertyclient.in", full_name="Nisha Menon", hashed_password=hash_password("Admin@1234"), role=UserRole.CLIENT, client_id=client_account.id, client_subrole="assistant_engineer")
    commandant_engineer = User(email="commandant@propertyclient.in", full_name="Arun Prakash", hashed_password=hash_password("Admin@1234"), role=UserRole.CLIENT, client_id=client_account.id, client_subrole="commandant_engineer")
    enduser_1    = User(email="security@property.in",      full_name="Ganesh Kumar",   hashed_password=hash_password("User@1234"),        role=UserRole.ENDUSER, client_id=client_account.id)
    enduser_2    = User(email="reception@property.in",     full_name="Meena Iyer",     hashed_password=hash_password("User@1234"),        role=UserRole.ENDUSER, client_id=client_account.id)
    enduser_3    = User(email="it@property.in",            full_name="Ajay Sharma",    hashed_password=hash_password("User@1234"),        role=UserRole.ENDUSER, client_id=client_account.id)
    co_alpha     = User(email="manager@alphaserv.in",      full_name="Ravi Nair",      hashed_password=hash_password("Contractor@1234"),  role=UserRole.CONTRACTOR, contractor_id=alphaserv.id)
    co_cool      = User(email="manager@cooltech.in",       full_name="Deepa Krishnan", hashed_password=hash_password("Contractor@1234"),  role=UserRole.CONTRACTOR, contractor_id=cooltech.id)
    co_bright    = User(email="manager@brightco.in",       full_name="Sunil Joshi",    hashed_password=hash_password("Contractor@1234"),  role=UserRole.CONTRACTOR, contractor_id=brightco.id)
    sup_ramesh   = User(email="ramesh@alphaserv.in",       full_name="Ramesh Kumar",   hashed_password=hash_password("Super@1234"),       role=UserRole.SUPERVISOR, contractor_id=alphaserv.id)
    sup_priya    = User(email="priya@cooltech.in",          full_name="Priya Menon",    hashed_password=hash_password("Super@1234"),       role=UserRole.SUPERVISOR, contractor_id=cooltech.id)
    sup_vijay    = User(email="vijay@brightco.in",          full_name="Vijay Rao",      hashed_password=hash_password("Super@1234"),       role=UserRole.SUPERVISOR, contractor_id=brightco.id)
    wm_suresh    = User(email="suresh@alphaserv.in",       full_name="Suresh Pillai",  hashed_password=hash_password("Work@1234"),        role=UserRole.WORKMAN,    contractor_id=alphaserv.id)
    wm_arun      = User(email="arun@cooltech.in",           full_name="Arun Singh",     hashed_password=hash_password("Work@1234"),        role=UserRole.WORKMAN,    contractor_id=cooltech.id)
    wm_kiran     = User(email="kiran@brightco.in",          full_name="Kiran Thakur",   hashed_password=hash_password("Work@1234"),        role=UserRole.WORKMAN,    contractor_id=brightco.id)
    wm_dev       = User(email="dev@alphaserv.in",           full_name="Dev Bose",       hashed_password=hash_password("Work@1234"),        role=UserRole.WORKMAN,    contractor_id=alphaserv.id)

    all_users = [superadmin, client_admin, assistant_engineer, commandant_engineer, enduser_1, enduser_2, enduser_3,
                 co_alpha, co_cool, co_bright,
                 sup_ramesh, sup_priya, sup_vijay,
                 wm_suresh, wm_arun, wm_kiran, wm_dev]
    db.add_all(all_users)
    db.flush()
    print(f"  {len(all_users)} users inserted")

    contractor_links = [
        ClientContractorLink(client_id=client_account.id, contractor_id=contractor.id, status=ClientContractorStatus.LINKED)
        for contractor in [alphaserv, cooltech, brightco, hydrofix]
        if contractor is not None
    ]
    db.add_all(contractor_links)
    db.flush()

    # Work Orders
    def ago(hours):
        return datetime.now(timezone.utc) - timedelta(hours=hours)

    wos = [
        WorkOrder(ref_number="WO-0001", title="Gate motor fault — B2",      description="Gate motor not responding to remote. Vehicle access blocked.",              category=WOCategory.ELECTRICAL, area="Block B2 — Gate",        priority=WOPriority.HIGH,   status=WOStatus.ESCALATED,  raised_by_id=enduser_1.id,    client_id=client_account.id, contractor_id=alphaserv.id, supervisor_id=sup_ramesh.id, workman_id=wm_suresh.id, sla_hours=4,  sla_breached=True,  created_at=ago(7),   started_at=ago(6),   due_date=ago(3)),
        WorkOrder(ref_number="WO-0002", title="HVAC filter replace — F3",   description="HVAC filter clogged. Tenants on Floor 3 complaining of bad air quality.",   category=WOCategory.HVAC,       area="Floor 3 — AHU Room",     priority=WOPriority.MEDIUM, status=WOStatus.INPROGRESS, raised_by_id=enduser_2.id,    client_id=client_account.id, contractor_id=cooltech.id,  supervisor_id=sup_priya.id,  workman_id=wm_arun.id,   sla_hours=24, sla_breached=False, created_at=ago(18),  started_at=ago(16)),
        WorkOrder(ref_number="WO-0003", title="Lobby lighting fix — Main",  description="3 overhead LED fixtures not working in main lobby.",                         category=WOCategory.ELECTRICAL, area="Main Lobby — Reception",  priority=WOPriority.LOW,    status=WOStatus.ASSIGNED,   raised_by_id=enduser_2.id,    client_id=client_account.id, contractor_id=brightco.id,  supervisor_id=sup_vijay.id,  workman_id=wm_kiran.id,  sla_hours=48, sla_breached=False, created_at=ago(2)),
        WorkOrder(ref_number="WO-0004", title="Pump room inspection",       description="Routine scheduled pump inspection and pressure check.",                      category=WOCategory.PLUMBING,   area="Basement — Pump Room",   priority=WOPriority.HIGH,   status=WOStatus.CLOSED,     raised_by_id=client_admin.id, client_id=client_account.id, contractor_id=alphaserv.id, supervisor_id=sup_ramesh.id, workman_id=wm_dev.id,    sla_hours=8,  sla_breached=False, created_at=ago(120), started_at=ago(116), closed_at=ago(114)),
        WorkOrder(ref_number="WO-0005", title="Roof drainage blockage",     description="Drainage outlet on rooftop blocked. Water pooling — seepage risk.",         category=WOCategory.PLUMBING,   area="Rooftop — Terrace",       priority=WOPriority.HIGH,   status=WOStatus.OPEN,       raised_by_id=enduser_1.id,    client_id=client_account.id, contractor_id=hydrofix.id,  sla_hours=12, sla_breached=False, created_at=ago(1)),
        WorkOrder(ref_number="WO-0006", title="Server room AC fault",       description="AC unit tripping. IT reports temp rising above 26C. Critical system risk.", category=WOCategory.HVAC,       area="IT Room — 2nd Floor",     priority=WOPriority.HIGH,   status=WOStatus.PENDING,    raised_by_id=enduser_3.id,    client_id=client_account.id, contractor_id=cooltech.id,  supervisor_id=sup_priya.id,  workman_id=wm_arun.id,   sla_hours=6,  sla_breached=True,  created_at=ago(22),  started_at=ago(20)),
    ]
    db.add_all(wos)
    db.flush()
    print(f"  {len(wos)} work orders inserted")

    # Activity logs
    def log(wo, user, action, note="", from_s=None, to_s=None, hours_ago=0):
        db.add(ActivityLog(work_order_id=wo.id, user_id=user.id if user else None, action=action, note=note, from_status=from_s, to_status=to_s, created_at=ago(hours_ago)))

    log(wos[0], enduser_1,    "Request raised",               "Gate stuck open — security risk",       to_s="open",         hours_ago=7)
    log(wos[0], client_admin, "Assigned to AlphaServ",        "High priority — vehicle access route",  from_s="open",       to_s="assigned",    hours_ago=6.5)
    log(wos[0], sup_ramesh,   "Delegated to Suresh Pillai",   "",                                      from_s="assigned",   to_s="inprogress",  hours_ago=6)
    log(wos[0], None,         "Auto-escalated: SLA breached", "4h SLA exceeded by 3h",                from_s="inprogress", to_s="escalated",   hours_ago=3)
    log(wos[1], enduser_2,    "Request raised",               "Bad air quality from tenants",          to_s="open",         hours_ago=18)
    log(wos[1], client_admin, "Assigned to CoolTech",         "",                                      from_s="open",       to_s="assigned",    hours_ago=17)
    log(wos[1], sup_priya,    "Work started",                 "Arun Singh on site with filters",       from_s="assigned",   to_s="inprogress",  hours_ago=16)
    log(wos[2], enduser_2,    "Request raised",               "Fixtures 3, 7, 11 not working",         to_s="open",         hours_ago=2)
    log(wos[2], client_admin, "Assigned to BrightCo",         "",                                      from_s="open",       to_s="assigned",    hours_ago=1.5)
    log(wos[3], client_admin, "Request raised",               "Scheduled monthly inspection",          to_s="open",         hours_ago=120)
    log(wos[3], co_alpha,     "Work started",                 "",                                      from_s="assigned",   to_s="inprogress",  hours_ago=116)
    log(wos[3], sup_ramesh,   "QC passed",                    "All pressure checks normal",            from_s="inprogress", to_s="qc",          hours_ago=115)
    log(wos[3], client_admin, "Approved & Closed",            "Signed off — all readings normal",      from_s="pending",    to_s="closed",      hours_ago=114)
    log(wos[4], enduser_1,    "Request raised",               "Water pooling — seepage risk",          to_s="open",         hours_ago=1)
    log(wos[5], enduser_3,    "Request raised",               "Critical — server overheating risk",    to_s="open",         hours_ago=22)
    log(wos[5], client_admin, "Assigned to CoolTech",         "Urgent — 6h SLA",                       from_s="open",       to_s="assigned",    hours_ago=21)
    log(wos[5], sup_priya,    "Job done — pending approval",  "Replaced capacitor, AC now stable",     from_s="inprogress", to_s="pending",     hours_ago=2)

    db.commit()
    print("  Activity logs inserted")
    print()
    print("Seeding complete!")
    print()
    print("Demo credentials:")
    print("  owner@servtrack.in     /  Owner@1234         (Super Admin)")
    print("  admin@propertyclient.in   /  Admin@1234         (Client)")
    print("  manager@alphaserv.in      /  Contractor@1234    (Contractor)")
    print("  ramesh@alphaserv.in       /  Super@1234         (Supervisor)")
    print("  suresh@alphaserv.in       /  Work@1234          (Workman)")
    print("  security@property.in      /  User@1234          (End User)")


if __name__ == "__main__":
    try:
        seed()
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()
