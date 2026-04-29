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
