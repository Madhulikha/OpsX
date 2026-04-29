-- Shared contractor links and client ownership foundation

do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_contractor_status') then
    create type client_contractor_status as enum ('linked', 'invited', 'inactive');
  end if;
end $$;

create table if not exists clients (
    id          serial primary key,
    name        varchar(200) not null unique,
    created_at  timestamptz  not null default now()
);

alter table users
    add column if not exists client_id integer references clients(id) on delete set null;

alter table work_orders
    add column if not exists client_id integer references clients(id) on delete restrict;

create table if not exists client_contractor_links (
    id             serial primary key,
    client_id      integer not null references clients(id) on delete cascade,
    contractor_id  integer not null references contractors(id) on delete cascade,
    status         client_contractor_status not null default 'linked',
    created_at     timestamptz not null default now(),
    constraint uq_client_contractor_link unique (client_id, contractor_id)
);

create index if not exists idx_users_client_id on users(client_id);
create index if not exists idx_wo_client_id on work_orders(client_id);
create index if not exists idx_client_contractor_client on client_contractor_links(client_id);
create index if not exists idx_client_contractor_contractor on client_contractor_links(contractor_id);

insert into clients (name)
select 'Property Client'
where not exists (select 1 from clients where name = 'Property Client');

update users
set client_id = (select id from clients where name = 'Property Client' limit 1)
where client_id is null
  and role in ('client', 'enduser');

update work_orders wo
set client_id = coalesce(
    (select u.client_id from users u where u.id = wo.raised_by_id),
    (select id from clients where name = 'Property Client' limit 1)
)
where wo.client_id is null;

insert into client_contractor_links (client_id, contractor_id, status)
select c.id, contractor_source.contractor_id, 'linked'::client_contractor_status
from clients c
join (
    select contractor_id from work_orders where contractor_id is not null
    union
    select contractor_id from contracts
    union
    select id as contractor_id from contractors
) contractor_source on true
left join client_contractor_links existing
    on existing.client_id = c.id
   and existing.contractor_id = contractor_source.contractor_id
where c.name = 'Property Client'
  and existing.id is null;

alter table work_orders
    alter column client_id set not null;
