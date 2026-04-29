-- ================================================================
--  ServTrack — Database Schema
--  Paste this entire file into:
--  Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================

-- Enable UUID extension (already on by default in Supabase, but just in case)
create extension if not exists "pgcrypto";


-- ================================================================
--  ENUMS
-- ================================================================

create type user_role as enum (
    'client', 'contractor', 'supervisor', 'workman', 'enduser'
);

create type wo_status as enum (
    'open', 'assigned', 'inprogress', 'qc', 'pending', 'closed', 'escalated', 'rejected'
);

create type wo_priority as enum (
    'High', 'Med', 'Low'
);

create type wo_category as enum (
    'Electrical', 'HVAC', 'Plumbing', 'Civil', 'Fire Safety', 'Carpentry', 'Other'
);

create type contract_status as enum (
    'active', 'expired', 'pending', 'paused'
);

create type client_contractor_status as enum (
    'linked', 'invited', 'inactive'
);


-- ================================================================
--  CLIENTS
-- ================================================================

create table if not exists clients (
    id          serial primary key,
    name        varchar(200)    not null unique,
    created_at  timestamptz     not null default now()
);


-- ================================================================
--  CONTRACTORS
-- ================================================================

create table if not exists contractors (
    id          serial primary key,
    name        varchar(200)    not null,
    speciality  varchar(300),
    email       varchar(255),
    phone       varchar(20),
    address     text,
    rating      numeric(3,1)    not null default 0.0,
    is_active   boolean         not null default true,
    created_at  timestamptz     not null default now()
);

create index if not exists idx_contractors_active on contractors(is_active);


-- ================================================================
--  CONTRACTS
-- ================================================================

create table if not exists contracts (
    id                  serial primary key,
    contractor_id       integer         not null references contractors(id) on delete cascade,
    title               varchar(300)    not null,
    scope               text,
    start_date          date            not null,
    end_date            date            not null,
    value               numeric(14,2)   not null default 0,
    default_sla_hours   integer         not null default 24,
    status              contract_status not null default 'active',
    created_at          timestamptz     not null default now()
);

create index if not exists idx_contracts_contractor on contracts(contractor_id);


-- ================================================================
--  USERS
-- ================================================================

create table if not exists users (
    id                serial primary key,
    email             varchar(255)    not null unique,
    full_name         varchar(255)    not null,
    hashed_password   varchar(255)    not null,
    role              user_role       not null,
    phone             varchar(20),
    contractor_id     integer         references contractors(id) on delete set null,
    client_id         integer         references clients(id) on delete set null,
    client_subrole    varchar(50),
    is_active         boolean         not null default true,
    created_at        timestamptz     not null default now()
);

create index if not exists idx_users_email         on users(email);
create index if not exists idx_users_contractor_id on users(contractor_id);
create index if not exists idx_users_client_id     on users(client_id);
create index if not exists idx_users_role          on users(role);


-- ================================================================
--  WORK ORDERS
-- ================================================================

create table if not exists work_orders (
    id              serial primary key,
    ref_number      varchar(20)     not null unique,
    title           varchar(300)    not null,
    description     text,
    category        wo_category     not null,
    sub_category    varchar(120),
    area            varchar(200)    not null,
    preferred_visit_time varchar(80),
    priority        wo_priority     not null,
    status          wo_status       not null default 'open',

    raised_by_id    integer         not null references users(id)       on delete restrict,
    client_id       integer         not null references clients(id)     on delete restrict,
    contractor_id   integer                  references contractors(id)  on delete set null,
    supervisor_id   integer                  references users(id)        on delete set null,
    workman_id      integer                  references users(id)        on delete set null,

    sla_hours       integer         not null default 24,
    due_date        timestamptz,
    started_at      timestamptz,
    closed_at       timestamptz,
    sla_breached    boolean         not null default false,

    created_at      timestamptz     not null default now(),
    updated_at      timestamptz     not null default now()
);

create index if not exists idx_wo_status        on work_orders(status);
create index if not exists idx_wo_client        on work_orders(client_id);
create index if not exists idx_wo_contractor    on work_orders(contractor_id);
create index if not exists idx_wo_supervisor    on work_orders(supervisor_id);
create index if not exists idx_wo_workman       on work_orders(workman_id);
create index if not exists idx_wo_raised_by     on work_orders(raised_by_id);

create table if not exists work_order_attachments (
    id                 serial primary key,
    work_order_id      integer       not null references work_orders(id) on delete cascade,
    file_url           varchar(500)  not null,
    original_filename  varchar(255)  not null,
    content_type       varchar(100)  not null,
    file_size          integer       not null,
    created_at         timestamptz   not null default now()
);

create index if not exists idx_wo_attachment_wo on work_order_attachments(work_order_id);

-- Auto-update updated_at on any row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_wo_updated_at on work_orders;
create trigger trg_wo_updated_at
    before update on work_orders
    for each row execute function set_updated_at();


-- ================================================================
--  ACTIVITY LOG
-- ================================================================

create table if not exists activity_log (
    id              serial primary key,
    work_order_id   integer         not null references work_orders(id) on delete cascade,
    user_id         integer                  references users(id)       on delete set null,
    action          varchar(300)    not null,
    note            text,
    from_status     varchar(50),
    to_status       varchar(50),
    created_at      timestamptz     not null default now()
);

create index if not exists idx_activity_wo   on activity_log(work_order_id);
create index if not exists idx_activity_user on activity_log(user_id);


-- ================================================================
--  NOTIFICATIONS
-- ================================================================

create table if not exists notifications (
    id              serial primary key,
    work_order_id   integer         references work_orders(id) on delete cascade,
    user_id         integer         not null references users(id) on delete cascade,
    title           varchar(200)    not null,
    body            text,
    notif_type      varchar(50)     not null default 'info',
    is_read         boolean         not null default false,
    created_at      timestamptz     not null default now()
);

create index if not exists idx_notif_user    on notifications(user_id);
create index if not exists idx_notif_wo      on notifications(work_order_id);
create index if not exists idx_notif_unread  on notifications(user_id, is_read);


-- ================================================================
--  CLIENT ↔ CONTRACTOR LINKS
-- ================================================================

create table if not exists client_contractor_links (
    id             serial primary key,
    client_id      integer                  not null references clients(id) on delete cascade,
    contractor_id  integer                  not null references contractors(id) on delete cascade,
    status         client_contractor_status not null default 'linked',
    created_at     timestamptz              not null default now(),
    constraint uq_client_contractor_link unique (client_id, contractor_id)
);

create index if not exists idx_client_contractor_client on client_contractor_links(client_id);
create index if not exists idx_client_contractor_contractor on client_contractor_links(contractor_id);


-- ================================================================
--  SEED DATA
--  (runs after schema creation in the same query)
-- ================================================================

-- Contractors
insert into contractors (name, speciality, email, phone, rating) values
    ('AlphaServ',  'Electrical, Civil, Plumbing',      'ops@alphaserv.in', '9800000001', 4.8),
    ('CoolTech',   'HVAC, Air Conditioning',            'ops@cooltech.in',  '9800000002', 4.5),
    ('BrightCo',   'Electrical, Lighting',              'ops@brightco.in',  '9800000003', 4.6),
    ('HydroFix',   'Plumbing, Drainage, Waterproofing', 'ops@hydrofix.in',  '9800000004', 4.3)
on conflict do nothing;

insert into clients (name) values
    ('Property Client')
on conflict do nothing;

-- Contracts (reference contractors by name for portability)
insert into contracts (contractor_id, title, scope, start_date, end_date, value, default_sla_hours, status)
select id, 'Annual Electrical & Civil AMC', 'All electrical and civil maintenance', current_date, current_date + 365, 1200000, 8, 'active'
from contractors where name = 'AlphaServ' on conflict do nothing;

insert into contracts (contractor_id, title, scope, start_date, end_date, value, default_sla_hours, status)
select id, 'HVAC Maintenance Contract', 'All HVAC units, AHUs, cooling towers', current_date, current_date + 365, 800000, 6, 'active'
from contractors where name = 'CoolTech' on conflict do nothing;

insert into contracts (contractor_id, title, scope, start_date, end_date, value, default_sla_hours, status)
select id, 'Lighting & Electrical AMC', 'Common area lighting, DB panels, UPS', current_date, current_date + 365, 500000, 12, 'active'
from contractors where name = 'BrightCo' on conflict do nothing;

insert into contracts (contractor_id, title, scope, start_date, end_date, value, default_sla_hours, status)
select id, 'Plumbing & Drainage Contract', 'All plumbing fixtures, drainage, pumps', current_date, current_date + 365, 400000, 12, 'active'
from contractors where name = 'HydroFix' on conflict do nothing;

insert into client_contractor_links (client_id, contractor_id, status)
select c.id, ctr.id, 'linked'
from clients c
cross join contractors ctr
where c.name = 'Property Client'
on conflict do nothing;

-- Users
-- Passwords below are bcrypt hashes. Plaintext shown in comments.
-- Admin@1234   → $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFhWbCFf6.KBGF6
-- Contractor@1234 → $2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
-- Super@1234   → $2b$12$Ei3bXR9GJQH3K5iCrB.WZ.W7F3v8yKqzBeFTT3g5KkG8MOq3FYJNK
-- Work@1234    → $2b$12$bGHQ0BDGtIWC6QjlT7TqXuXHGJm9vXfFmVTzE0SiGy1uf7aTwGP9e
-- User@1234    → $2b$12$Y.AkZf3h5j5xT/JW7n8YJeGqT3y9WpB3KBJsETUH7Qb6XJKwh5BXq

-- Rather than embedding bcrypt hashes (which vary by salt), use seed.py to insert users.
-- The schema.sql handles structure + non-user seed data.
-- Run: python seed.py   after applying this schema.


-- ================================================================
--  DONE — Check output below for any errors
-- ================================================================
select 'Schema created successfully ✓' as status;
