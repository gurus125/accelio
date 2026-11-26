-- Phase 8: WhatsApp connection configuration + a persistent messages table,
-- both with mandatory Row Level Security following the exact same
-- per-business tenant-isolation pattern as Phase 4. Safe to re-run.

-- ============================================================================
-- whatsapp_connections — one row per business, holding only NON-SECRET
-- Meta WhatsApp Cloud API identifiers (phone_number_id, business_account_id,
-- the connected display number, and a connection_status). This is shaped so
-- each business can eventually have its own WhatsApp Business Account.
--
-- IMPORTANT — access token storage:
-- The Meta access token itself is NOT stored in this table, or anywhere in
-- the database. For this MVP there is a single shared System User access
-- token, held only in the server-side WHATSAPP_ACCESS_TOKEN environment
-- variable (never in the database, never sent to the browser). That means
-- every business currently sends through the one Meta WhatsApp Business
-- Account configured in the environment — this table exists so the
-- *identifiers* are already business-scoped, but true multi-tenant "each
-- business connects their own WABA" requires a real Embedded Signup/OAuth
-- flow and a proper secret store (e.g. Supabase Vault, or an external
-- secrets manager) before per-business tokens could be stored safely. That
-- is explicitly out of scope for Phase 8 — see the Phase 8 report.
-- ============================================================================
create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  phone_number_id text,
  business_account_id text,
  display_phone_number text,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected', 'connected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_connections_business_id_idx
  on public.whatsapp_connections(business_id);

drop trigger if exists whatsapp_connections_set_updated_at on public.whatsapp_connections;
create trigger whatsapp_connections_set_updated_at
  before update on public.whatsapp_connections
  for each row execute function public.set_updated_at();

alter table public.whatsapp_connections enable row level security;

drop policy if exists "whatsapp_connections_select_own_business" on public.whatsapp_connections;
create policy "whatsapp_connections_select_own_business" on public.whatsapp_connections
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "whatsapp_connections_insert_own_business" on public.whatsapp_connections;
create policy "whatsapp_connections_insert_own_business" on public.whatsapp_connections
  for insert with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "whatsapp_connections_update_own_business" on public.whatsapp_connections;
create policy "whatsapp_connections_update_own_business" on public.whatsapp_connections
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "whatsapp_connections_delete_own_business" on public.whatsapp_connections;
create policy "whatsapp_connections_delete_own_business" on public.whatsapp_connections
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- ============================================================================
-- messages — persistent record of every outbound WhatsApp message attempt.
-- Deliberately minimal columns; Phase 9 can add delivered_at/read_at/
-- replied_at without touching this shape.
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  opportunity_type text,
  message_type text not null default 'freeform' check (message_type in ('template', 'freeform')),
  template_name text,
  content text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_business_id_idx on public.messages(business_id);
create index if not exists messages_customer_id_idx on public.messages(customer_id);
create index if not exists messages_business_id_created_at_idx
  on public.messages(business_id, created_at desc);

-- Used by the webhook to find the right message from Meta's status
-- callback. Partial + unique so multiple drafts (null provider_message_id)
-- never collide, but a real provider id can never be duplicated.
create unique index if not exists messages_provider_message_id_key
  on public.messages(provider_message_id)
  where provider_message_id is not null;

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- Defense in depth, same pattern as customer_events: force
-- messages.business_id to always match its customer's real business_id.
-- search_path is pinned (matching the other trigger functions in this
-- schema) so this function can't be tricked by a mutable search_path.
create or replace function public.set_message_business_id()
returns trigger
language plpgsql
set search_path = ''
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

drop trigger if exists messages_set_business_id on public.messages;
create trigger messages_set_business_id
  before insert or update of customer_id on public.messages
  for each row execute function public.set_message_business_id();

alter table public.messages enable row level security;

-- A business can only ever see its own messages — never another
-- business's communication history.
drop policy if exists "messages_select_own_business" on public.messages;
create policy "messages_select_own_business" on public.messages
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "messages_insert_own_business" on public.messages;
create policy "messages_insert_own_business" on public.messages
  for insert with check (
    customer_id in (
      select id from public.customers
      where business_id in (select id from public.businesses where owner_id = auth.uid())
    )
  );

drop policy if exists "messages_update_own_business" on public.messages;
create policy "messages_update_own_business" on public.messages
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- No delete policy: a business can create and update its own messages
-- (e.g. draft -> sending -> sent/failed) but message history is never
-- deleted through the app — it's the communication record of record.
