-- Phase 4: core business/customer schema with mandatory Row Level Security
-- enforcing strict per-business tenant isolation at the database level.
--
-- Run this once in your Supabase project's SQL Editor (or via the Supabase
-- CLI: `supabase db push`). Safe to re-run — every statement is idempotent
-- (`if not exists` / `drop ... if exists` before `create`).

create extension if not exists pgcrypto;

-- ============================================================================
-- businesses — one row per user (V1: one business per user, enforced by the
-- unique constraint on owner_id).
-- ============================================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  business_type text,
  owner_name text,
  city text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_id_idx on public.businesses(owner_id);

-- ============================================================================
-- customers
-- ============================================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text not null,
  status text not null default 'active' check (status in ('active', 'due', 'inactive', 'follow_up')),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_id_idx on public.customers(business_id);
create index if not exists customers_business_id_status_idx on public.customers(business_id, status);
create index if not exists customers_business_id_name_idx on public.customers(business_id, name);

-- ============================================================================
-- customer_events — visits, notes, and other logged activity for a customer.
-- ============================================================================
create table if not exists public.customer_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  event_type text not null default 'visit' check (event_type in ('visit', 'note', 'other')),
  service text,
  amount numeric(10, 2),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists customer_events_customer_id_idx on public.customer_events(customer_id);
create index if not exists customer_events_business_id_idx on public.customer_events(business_id);
create index if not exists customer_events_occurred_at_idx on public.customer_events(occurred_at desc);

-- ============================================================================
-- updated_at bookkeeping
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Defense in depth: force customer_events.business_id to always match its
-- customer's actual business_id, so a mismatched or forged business_id can
-- never be persisted even if application code has a bug. RLS below is the
-- primary defense; this trigger is a second, database-enforced guarantee.
-- ============================================================================
create or replace function public.set_customer_event_business_id()
returns trigger
language plpgsql
as $$
declare
  owning_business_id uuid;
begin
  select business_id into owning_business_id
  from public.customers
  where id = new.customer_id;

  if owning_business_id is null then
    raise exception 'customer_id % does not exist', new.customer_id;
  end if;

  new.business_id = owning_business_id;
  return new;
end;
$$;

drop trigger if exists customer_events_set_business_id on public.customer_events;
create trigger customer_events_set_business_id
  before insert or update of customer_id on public.customer_events
  for each row execute function public.set_customer_event_business_id();

-- ============================================================================
-- Row Level Security — the core tenant-isolation guarantee. Every policy is
-- keyed off auth.uid() (the authenticated user from their session token),
-- never a client-supplied value. The application layer also never trusts a
-- client-supplied business_id, but RLS is what makes isolation true even if
-- a future bug in application code forgets to filter.
-- ============================================================================
alter table public.businesses enable row level security;
alter table public.customers enable row level security;
alter table public.customer_events enable row level security;

-- businesses: a user can only see/manage their own business row.
drop policy if exists "businesses_select_own" on public.businesses;
create policy "businesses_select_own" on public.businesses
  for select using (auth.uid() = owner_id);

drop policy if exists "businesses_insert_own" on public.businesses;
create policy "businesses_insert_own" on public.businesses
  for insert with check (auth.uid() = owner_id);

drop policy if exists "businesses_update_own" on public.businesses;
create policy "businesses_update_own" on public.businesses
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "businesses_delete_own" on public.businesses;
create policy "businesses_delete_own" on public.businesses
  for delete using (auth.uid() = owner_id);

-- customers: only reachable through a business the current user owns.
drop policy if exists "customers_select_own_business" on public.customers;
create policy "customers_select_own_business" on public.customers
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "customers_insert_own_business" on public.customers;
create policy "customers_insert_own_business" on public.customers
  for insert with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "customers_update_own_business" on public.customers;
create policy "customers_update_own_business" on public.customers
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "customers_delete_own_business" on public.customers;
create policy "customers_delete_own_business" on public.customers
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- customer_events: same rule, one join further through customers.
drop policy if exists "customer_events_select_own_business" on public.customer_events;
create policy "customer_events_select_own_business" on public.customer_events
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "customer_events_insert_own_business" on public.customer_events;
create policy "customer_events_insert_own_business" on public.customer_events
  for insert with check (
    customer_id in (
      select id from public.customers
      where business_id in (select id from public.businesses where owner_id = auth.uid())
    )
  );

drop policy if exists "customer_events_update_own_business" on public.customer_events;
create policy "customer_events_update_own_business" on public.customer_events
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    customer_id in (
      select id from public.customers
      where business_id in (select id from public.businesses where owner_id = auth.uid())
    )
  );

drop policy if exists "customer_events_delete_own_business" on public.customer_events;
create policy "customer_events_delete_own_business" on public.customer_events
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );
