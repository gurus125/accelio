-- Phase 14 — controlled automation & scheduling.
--
-- Two new tables:
--  * automations: an owner-configured "when X happens, do Y after Z" rule,
--    scoped to one of exactly four safe trigger types (see the
--    automation_type check below). Never a general workflow engine.
--  * automation_runs: an append-mostly audit log of what the automation
--    engine actually decided for a specific lead/customer, so an owner can
--    see WHY something was or wasn't sent. Written only by the server-side
--    engine (service-role client) — never by client code.
--
-- No changes to `messages`/`customer_messages` are needed: an
-- automation-sent message reuses the exact same `messages` row shape as
-- every other send, tagged via the existing free-text `opportunity_type`
-- column (e.g. "automation:new_lead_followup") so analytics can tell
-- manual/campaign/automation sends apart without a schema change or a
-- second messaging table (Phase 14 spec step 36).

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  -- The four safe, predefined trigger types this phase supports —
  -- deliberately not an open-ended workflow builder (spec step 3/45).
  automation_type text not null check (automation_type in (
    'new_lead_followup', 'due_for_return', 'follow_up_reminder', 'service_reminder'
  )),
  -- Kept as its own column (mirrors automation_type 1:1 for now) so a
  -- future phase could introduce a second trigger for the same action
  -- type without a schema change — not used to mean anything different
  -- from automation_type today.
  trigger_type text not null,
  action_type text not null check (action_type in ('create_recommendation', 'send_whatsapp')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  language text not null default 'english' check (language in ('english', 'hinglish')),
  tone text not null default 'friendly' check (tone in ('friendly', 'professional', 'warm')),
  -- Required before an automation with action_type='send_whatsapp' may be
  -- activated (enforced in application code at activation time, since a
  -- draft-in-progress automation is allowed to have no template yet).
  message_template text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz
);

create index if not exists automations_business_id_idx on public.automations(business_id);
create index if not exists automations_business_id_status_idx on public.automations(business_id, status);
-- The scheduler's main query: "every active automation, across all
-- businesses, of a given type" — never scans by owner/session.
create index if not exists automations_status_type_idx on public.automations(status, automation_type) where status = 'active';

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  -- Stable identifier for "this logical trigger occurrence" — e.g.
  -- "lead:<lead_id>" or the same "<customer_id>:<opportunity_type>" key
  -- Phase 6's own Opportunity.id already uses. Combined with automation_id
  -- this is what duplicate-execution protection keys off (see the unique
  -- index below) — never trusted from the client, always computed
  -- server-side from real entity ids.
  entity_event_key text not null,
  status text not null check (status in ('eligible', 'skipped', 'sent', 'failed')),
  reason text,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint automation_runs_one_entity check (num_nonnulls(lead_id, customer_id) = 1)
);

create index if not exists automation_runs_business_id_idx on public.automation_runs(business_id);
create index if not exists automation_runs_automation_id_idx on public.automation_runs(automation_id, executed_at desc);
create index if not exists automation_runs_lead_id_idx on public.automation_runs(lead_id) where lead_id is not null;
create index if not exists automation_runs_customer_id_idx on public.automation_runs(customer_id) where customer_id is not null;

-- Database-level duplicate-send protection (spec step 18): at most one
-- 'sent' row can ever exist for a given automation + logical trigger
-- occurrence, even if the scheduler somehow runs the same job twice
-- concurrently. 'skipped'/'eligible' rows are NOT covered by this index on
-- purpose — the same lead/customer can be legitimately skipped many times
-- (e.g. once per tick while waiting for business hours) before eventually
-- being sent once.
create unique index if not exists automation_runs_sent_once_idx
  on public.automation_runs(automation_id, entity_event_key)
  where status = 'sent';

-- Business-level emergency stop (spec step 24): "Pause all automations".
-- Deliberately NOT a change to every automation's own `status`, so
-- resuming restores each automation's individual active/paused state
-- exactly as it was.
alter table public.businesses add column if not exists automations_paused_at timestamptz;

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

create policy automations_select_own_business on public.automations
  for select using (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy automations_insert_own_business on public.automations
  for insert with check (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy automations_update_own_business on public.automations
  for update using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

-- automation_runs is written only by the server-side engine via the
-- service-role client (which bypasses RLS, same pattern as the Phase 13
-- lead-capture path and the Phase 9 webhook) — the owner only ever reads
-- it, so only a select policy is defined; no client code ever inserts or
-- updates a run row directly.
create policy automation_runs_select_own_business on public.automation_runs
  for select using (business_id in (select id from public.businesses where owner_id = auth.uid()));

create trigger set_automations_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();
