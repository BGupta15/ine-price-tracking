-- Run this in Supabase → SQL Editor → New query → Run
create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  product_id integer not null unique,   
  sku text,
  category text,
  brand text,
  tracked_at timestamptz not null default now()
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  price numeric,
  details jsonb,
  currency text default 'INR',
  in_stock boolean,
  stock_qty integer,
  scraped_at timestamptz not null default now()
);

create table if not exists scrape_log (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  attempts integer not null default 1,
  detail text          -- error message on failure, or a short note on success
);

-- Speeds up "give me this product's history / log, newest first"
create index if not exists idx_price_history_product_time
  on price_history (tracked_product_id, scraped_at desc);

create index if not exists idx_scrape_log_product_time
  on scrape_log (tracked_product_id, attempted_at desc);
