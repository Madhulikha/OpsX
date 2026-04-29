alter type wo_status add value if not exists 'rejected';

alter table users
    add column if not exists client_subrole varchar(50);

create index if not exists idx_users_client_subrole on users(client_subrole);

alter table work_orders
    add column if not exists sub_category varchar(120),
    add column if not exists preferred_visit_time varchar(80);
