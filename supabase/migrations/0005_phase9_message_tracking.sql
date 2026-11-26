-- Phase 9: WhatsApp message status tracking (delivered/read/failed) +
-- customer replies. Builds on Phase 8's `messages` table and webhook
-- handler — no rebuild, only additive columns/tables. Safe to re-run.

-- ============================================================================
-- messages — extend the Phase 8 lifecycle with real Meta delivery states.
-- Phase 8 only ever wrote draft/sending/sent/failed; this adds
-- delivered/read plus the timestamps to tell them apart, matching the
-- Phase 8 migration's own comment that flagged this as future work.
--
-- `error_message` (Phase 8) is reused as the sanitized failure reason —
-- deliberately not duplicated as a new `failure_reason` column.
-- ============================================================================
alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('draft', 'approved', 'sending', 'sent', 'delivered', 'read', 'failed'));

-- ============================================================================
-- message_events — append-only audit log of every webhook status/inbound
-- event Meta sends, keyed so duplicate deliveries (Meta retries) are
-- ignored rather than double-counted. Never shown raw in the owner-facing
-- UI (see the Phase 9 report) — it exists purely so webhook processing is
-- debuggable and provably idempotent.
-- ============================================================================
create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  provider_message_id text,
  event_type text not null check (event_type in ('sent', 'delivered', 'read', 'failed', 'received')),
  event_payload jsonb,
  event_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists message_events_business_id_idx on public.message_events(business_id);
create index if not exists message_events_message_id_idx on public.message_events(message_id);

-- Idempotency key: Meta will retry webhook deliveries, but a given
-- WhatsApp message only ever reports each status once (and only ever has
-- one "received" event) — so (provider_message_id, event_type) uniquely
-- identifies one real occurrence. Partial (nulls excluded) since a few
-- malformed/unattributable payloads may lack an id entirely.
create unique index if not exists message_events_dedupe_idx
  on public.message_events(provider_message_id, event_type)
  where provider_message_id is not null;

alter table public.message_events enable row level security;

-- Read-only for the owning business — every write comes from the webhook's
-- service-role client, which bypasses RLS entirely (see
-- `@/lib/supabase/admin`). No insert/update/delete policy for authenticated
-- users: this table is never written to from an ordinary request.
drop policy if exists "message_events_select_own_business" on public.message_events;
create policy "message_events_select_own_business" on public.message_events
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- ============================================================================
-- customer_messages — inbound WhatsApp messages only (customer -> owner).
-- Outbound (owner -> customer) already lives in `messages`; deliberately
-- NOT duplicated here as a second "direction: outbound" row — the customer
-- timeline is built by merging `messages` (outbound) and `customer_messages`
-- (inbound) at query time. See lib/whatsapp/queries.ts.
--
-- `customer_id` is nullable: an inbound message from a phone number that
-- doesn't match any known customer is stored as an "unknown sender" rather
-- than silently discarded or attached to the wrong person. The owner can
-- explicitly convert it into a real customer later.
-- ============================================================================
create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  from_phone text not null,
  provider_message_id text,
  message_type text not null default 'text',
  content text,
  status text not null default 'received' check (status in ('received')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists customer_messages_business_id_idx on public.customer_messages(business_id);
create index if not exists customer_messages_customer_id_idx on public.customer_messages(customer_id);
create index if not exists customer_messages_business_id_received_at_idx
  on public.customer_messages(business_id, received_at desc);

-- Idempotency: Meta assigns every inbound message a unique wamid — a
-- retried webhook delivery must not create a second row for it.
create unique index if not exists customer_messages_provider_message_id_key
  on public.customer_messages(provider_message_id)
  where provider_message_id is not null;

alter table public.customer_messages enable row level security;

drop policy if exists "customer_messages_select_own_business" on public.customer_messages;
create policy "customer_messages_select_own_business" on public.customer_messages
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Update-only (never insert/delete) for authenticated users: the one
-- legitimate owner-initiated write to this table is attaching an
-- "unknown sender" message to a customer record after the owner clicks
-- "Add as customer" — everything else comes from the webhook's
-- service-role client.
drop policy if exists "customer_messages_update_own_business" on public.customer_messages;
create policy "customer_messages_update_own_business" on public.customer_messages
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );
