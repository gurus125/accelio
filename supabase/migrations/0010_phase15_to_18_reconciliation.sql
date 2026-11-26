-- Phase 19 hardening -- migration drift reconciliation.
--
-- AUDIT FINDING: the live Supabase project (zweoobzupefogkpghcsz) has 16
-- applied migrations, but this repo's supabase/migrations/ folder only had
-- files for the first 10 (through 0009_phase14_automations.sql). Everything
-- from Phase 15 onward -- teams/staff, function-grant tightening, billing,
-- "free is permanent", and the Phase 18 opportunity-engine tables -- was
-- applied directly to the live project (via the Supabase MCP tool across
-- several sessions) without a corresponding file ever being committed here.
--
-- That drift is a real production risk: anyone provisioning a fresh
-- environment (staging, disaster recovery, a new developer's local
-- Supabase) from this repo alone would get a schema missing staff/teams,
-- all of billing, and the entire Phase 18 opportunity engine.
--
-- This single file reconciles that gap. It is a RECONSTRUCTION from the
-- live schema's current, actual definitions (introspected via
-- information_schema / pg_catalog), not a byte-for-byte replay of the six
-- original migrations (20260917210611_phase15_teams_and_staff,
-- 20260917210643_phase15_tighten_function_grants,
-- 20260917212432_phase15_fix_function_public_grant,
-- 20260918111623_phase16_billing, 20260920155110_free_plan_permanent,
-- 20260920175535_opportunity_engine_baselines_and_recurring_schedules).
-- Every statement is guarded (IF NOT EXISTS / CREATE OR REPLACE / DROP
-- POLICY IF EXISTS + CREATE) so it is safe to run against a database that
-- already has some or all of this applied -- including the live project
-- itself, which is exactly the case this reconciliation is meant to catch
-- up any OTHER environment to. Going forward, every new phase must save
-- its migration file here at the same time it's applied, so this never
-- happens again.

-- ============================================================
-- PHASE 15 -- Teams & staff (business_members replaces owner_id-only auth)
-- ============================================================

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  name text,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_members_business_id_user_id_key
  on public.business_members(business_id, user_id);
create index if not exists business_members_business_id_idx on public.business_members(business_id);
create index if not exists business_members_user_id_idx on public.business_members(user_id);
create index if not exists business_members_status_idx on public.business_members(status);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_invitations_token_idx on public.business_invitations(token);
create index if not exists business_invitations_business_id_idx on public.business_invitations(business_id);
create index if not exists business_invitations_email_idx on public.business_invitations(lower(email));
create unique index if not exists business_invitations_pending_unique_idx
  on public.business_invitations(business_id, lower(email)) where (status = 'pending');

create table if not exists public.team_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null check (event_type in (
    'staff_invited', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'staff_removed'
  )),
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_audit_log_business_id_idx on public.team_audit_log(business_id);

-- Central authorization helpers -- SECURITY DEFINER so RLS policies that
-- call them don't need every table to duplicate the same subquery, and so
-- staff (not just the row's literal owner_id) are recognized everywhere.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.role = 'owner'
  );
$$;

alter table public.business_members enable row level security;
alter table public.business_invitations enable row level security;
alter table public.team_audit_log enable row level security;

drop policy if exists business_members_select_member on public.business_members;
create policy business_members_select_member on public.business_members
  for select using (public.is_business_member(business_id));
drop policy if exists business_members_insert_owner on public.business_members;
create policy business_members_insert_owner on public.business_members
  for insert with check (public.is_business_owner(business_id));
drop policy if exists business_members_update_owner on public.business_members;
create policy business_members_update_owner on public.business_members
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists business_members_delete_owner on public.business_members;
create policy business_members_delete_owner on public.business_members
  for delete using (public.is_business_owner(business_id));

drop policy if exists business_invitations_select_owner on public.business_invitations;
create policy business_invitations_select_owner on public.business_invitations
  for select using (public.is_business_owner(business_id));
drop policy if exists business_invitations_insert_owner on public.business_invitations;
create policy business_invitations_insert_owner on public.business_invitations
  for insert with check (public.is_business_owner(business_id));
drop policy if exists business_invitations_update_owner on public.business_invitations;
create policy business_invitations_update_owner on public.business_invitations
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists team_audit_log_select_member on public.team_audit_log;
create policy team_audit_log_select_member on public.team_audit_log
  for select using (public.is_business_member(business_id));
drop policy if exists team_audit_log_insert_member on public.team_audit_log;
create policy team_audit_log_insert_member on public.team_audit_log
  for insert with check (public.is_business_member(business_id));

create trigger set_business_members_updated_at
  before update on public.business_members
  for each row execute function public.set_updated_at();
create trigger set_business_invitations_updated_at
  before update on public.business_invitations
  for each row execute function public.set_updated_at();

-- Every business_id-scoped RLS policy across the app is rewritten here to
-- key off business_members (staff-aware) instead of businesses.owner_id
-- (owner-only) -- this is the actual Phase 15 authorization change. Reads
-- open to any active member; owner-only for administrative
-- writes/deletes, matching each table's existing convention.

drop policy if exists businesses_select_own on public.businesses;
create policy businesses_select_own on public.businesses
  for select using (public.is_business_member(id));
drop policy if exists businesses_update_own on public.businesses;
create policy businesses_update_own on public.businesses
  for update using (public.is_business_owner(id)) with check (public.is_business_owner(id));
drop policy if exists businesses_delete_own on public.businesses;
create policy businesses_delete_own on public.businesses
  for delete using (public.is_business_owner(id));
-- businesses_insert_own (auth.uid() = owner_id, on signup) is unchanged.

drop policy if exists customers_select_own_business on public.customers;
create policy customers_select_own_business on public.customers
  for select using (public.is_business_member(business_id));
drop policy if exists customers_insert_own_business on public.customers;
create policy customers_insert_own_business on public.customers
  for insert with check (public.is_business_member(business_id));
drop policy if exists customers_update_own_business on public.customers;
create policy customers_update_own_business on public.customers
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists customers_delete_own_business on public.customers;
create policy customers_delete_own_business on public.customers
  for delete using (public.is_business_owner(business_id));

drop policy if exists customer_events_select_own_business on public.customer_events;
create policy customer_events_select_own_business on public.customer_events
  for select using (public.is_business_member(business_id));
drop policy if exists customer_events_insert_own_business on public.customer_events;
create policy customer_events_insert_own_business on public.customer_events
  for insert with check (customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id)));
drop policy if exists customer_events_update_own_business on public.customer_events;
create policy customer_events_update_own_business on public.customer_events
  for update using (public.is_business_member(business_id))
  with check (customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id)));
drop policy if exists customer_events_delete_own_business on public.customer_events;
create policy customer_events_delete_own_business on public.customer_events
  for delete using (public.is_business_owner(business_id));

drop policy if exists whatsapp_connections_select_own_business on public.whatsapp_connections;
create policy whatsapp_connections_select_own_business on public.whatsapp_connections
  for select using (public.is_business_owner(business_id));
drop policy if exists whatsapp_connections_insert_own_business on public.whatsapp_connections;
create policy whatsapp_connections_insert_own_business on public.whatsapp_connections
  for insert with check (public.is_business_owner(business_id));
drop policy if exists whatsapp_connections_update_own_business on public.whatsapp_connections;
create policy whatsapp_connections_update_own_business on public.whatsapp_connections
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists whatsapp_connections_delete_own_business on public.whatsapp_connections;
create policy whatsapp_connections_delete_own_business on public.whatsapp_connections
  for delete using (public.is_business_owner(business_id));

drop policy if exists messages_select_own_business on public.messages;
create policy messages_select_own_business on public.messages
  for select using (public.is_business_member(business_id));
drop policy if exists messages_insert_own_business on public.messages;
create policy messages_insert_own_business on public.messages
  for insert with check (
    (customer_id is not null and customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id)))
    or (lead_id is not null and lead_id in (select l.id from public.leads l where public.is_business_member(l.business_id)))
  );
drop policy if exists messages_update_own_business on public.messages;
create policy messages_update_own_business on public.messages
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

drop policy if exists message_events_select_own_business on public.message_events;
create policy message_events_select_own_business on public.message_events
  for select using (public.is_business_member(business_id));

drop policy if exists customer_messages_select_own_business on public.customer_messages;
create policy customer_messages_select_own_business on public.customer_messages
  for select using (public.is_business_member(business_id));
drop policy if exists customer_messages_update_own_business on public.customer_messages;
create policy customer_messages_update_own_business on public.customer_messages
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

drop policy if exists campaigns_select_own_business on public.campaigns;
create policy campaigns_select_own_business on public.campaigns
  for select using (public.is_business_member(business_id));
drop policy if exists campaigns_insert_own_business on public.campaigns;
create policy campaigns_insert_own_business on public.campaigns
  for insert with check (public.is_business_owner(business_id));
drop policy if exists campaigns_update_own_business on public.campaigns;
create policy campaigns_update_own_business on public.campaigns
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists campaign_recipients_select_own_business on public.campaign_recipients;
create policy campaign_recipients_select_own_business on public.campaign_recipients
  for select using (public.is_business_member(business_id));
drop policy if exists campaign_recipients_insert_own_business on public.campaign_recipients;
create policy campaign_recipients_insert_own_business on public.campaign_recipients
  for insert with check (customer_id in (select c.id from public.customers c where public.is_business_owner(c.business_id)));
drop policy if exists campaign_recipients_update_own_business on public.campaign_recipients;
create policy campaign_recipients_update_own_business on public.campaign_recipients
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists campaign_recipients_delete_own_business on public.campaign_recipients;
create policy campaign_recipients_delete_own_business on public.campaign_recipients
  for delete using (public.is_business_owner(business_id));

drop policy if exists leads_select_own_business on public.leads;
create policy leads_select_own_business on public.leads
  for select using (public.is_business_member(business_id));
drop policy if exists leads_insert_own_business on public.leads;
create policy leads_insert_own_business on public.leads
  for insert with check (public.is_business_member(business_id));
drop policy if exists leads_update_own_business on public.leads;
create policy leads_update_own_business on public.leads
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

drop policy if exists lead_widgets_select_own_business on public.lead_widgets;
create policy lead_widgets_select_own_business on public.lead_widgets
  for select using (public.is_business_member(business_id));
drop policy if exists lead_widgets_insert_own_business on public.lead_widgets;
create policy lead_widgets_insert_own_business on public.lead_widgets
  for insert with check (public.is_business_owner(business_id));
drop policy if exists lead_widgets_update_own_business on public.lead_widgets;
create policy lead_widgets_update_own_business on public.lead_widgets
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists automations_select_own_business on public.automations;
create policy automations_select_own_business on public.automations
  for select using (public.is_business_member(business_id));
drop policy if exists automations_insert_own_business on public.automations;
create policy automations_insert_own_business on public.automations
  for insert with check (public.is_business_owner(business_id));
drop policy if exists automations_update_own_business on public.automations;
create policy automations_update_own_business on public.automations
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy if exists automation_runs_select_own_business on public.automation_runs;
create policy automation_runs_select_own_business on public.automation_runs
  for select using (public.is_business_member(business_id));

-- Function grants (phase15_tighten_function_grants / _fix_function_public_grant):
-- these two authorization helpers must be callable by the authenticated
-- role (every RLS policy above depends on it) but never by the anonymous
-- public role.
revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;
grant execute on function public.is_business_owner(uuid) to authenticated, service_role;

-- ============================================================
-- PHASE 16 -- Billing (Razorpay subscriptions, quotas, AI usage log)
-- ============================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan_id text not null check (plan_id in ('free', 'starter', 'growth')),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  downgrade_to_plan_id text check (downgrade_to_plan_id is null or downgrade_to_plan_id = 'free'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.subscriptions.downgrade_to_plan_id is
  'Set when a paid plan is scheduled to end on this plan (currently only ''free'') instead of a blocked cancelled state; the Razorpay webhook reads and clears it once the underlying subscription actually ends.';

create unique index if not exists subscriptions_provider_subscription_id_key
  on public.subscriptions(provider_subscription_id) where (provider_subscription_id is not null);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_events_provider_provider_event_id_key
  on public.billing_events(provider, provider_event_id);
create index if not exists billing_events_business_id_idx on public.billing_events(business_id, created_at desc);

create table if not exists public.ai_generation_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_log_business_id_created_at_idx
  on public.ai_generation_log(business_id, created_at desc);

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_generation_log enable row level security;

drop policy if exists "Business members can view their subscription" on public.subscriptions;
create policy "Business members can view their subscription" on public.subscriptions
  for select using (public.is_business_member(business_id));

drop policy if exists "Owners can view their business billing history" on public.billing_events;
create policy "Owners can view their business billing history" on public.billing_events
  for select using (business_id is not null and public.is_business_owner(business_id));

-- ai_generation_log has no authenticated-role policy at all -- a pure
-- internal usage counter, written and read only via the service-role
-- admin client (see lib/billing/usage.ts). RLS stays enabled with zero
-- policies so a client-side key could never read or write it even by
-- mistake.

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================
-- FREE PLAN PERMANENT -- free is a floor, never a trial that expires
-- ============================================================

-- The 'expired' status still exists in the check constraint for schema
-- compatibility, but the application no longer transitions any
-- subscription into it, and the Free plan's own trial fields are simply
-- left null / unused going forward -- see lib/billing/subscription.ts's
-- ensureFreeSubscriptionForBusiness for the actual runtime behavior this
-- backs.

-- ============================================================
-- PHASE 18 -- Opportunity engine: service baselines & recurring schedules
-- ============================================================

create table if not exists public.service_baselines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service text not null,
  expected_return_days integer not null check (expected_return_days > 0 and expected_return_days <= 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.service_baselines is
  'Business-defined expected return interval per service name (tier 1 of the opportunity engine baseline hierarchy). One row per distinct service the business has configured; matched case-insensitively against customer_events.service at read time.';

create unique index if not exists service_baselines_unique_service_per_business
  on public.service_baselines(business_id, lower(service));

create table if not exists public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null,
  anchor_date date not null,
  interval_type text not null default 'monthly' check (interval_type = 'monthly'),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.recurring_schedules is
  'Per-customer calendar-anchored recurring reminders, deliberately separate from the opportunity engine. Consumed by the "recurring_schedule" automation type.';

create index if not exists recurring_schedules_business_id_idx on public.recurring_schedules(business_id);
create index if not exists recurring_schedules_customer_id_idx on public.recurring_schedules(customer_id);

alter table public.service_baselines enable row level security;
alter table public.recurring_schedules enable row level security;

drop policy if exists service_baselines_select_own_business on public.service_baselines;
create policy service_baselines_select_own_business on public.service_baselines
  for select using (public.is_business_member(business_id));
drop policy if exists service_baselines_insert_own_business on public.service_baselines;
create policy service_baselines_insert_own_business on public.service_baselines
  for insert with check (public.is_business_member(business_id));
drop policy if exists service_baselines_update_own_business on public.service_baselines;
create policy service_baselines_update_own_business on public.service_baselines
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists service_baselines_delete_own_business on public.service_baselines;
create policy service_baselines_delete_own_business on public.service_baselines
  for delete using (public.is_business_owner(business_id));

drop policy if exists recurring_schedules_select_own_business on public.recurring_schedules;
create policy recurring_schedules_select_own_business on public.recurring_schedules
  for select using (public.is_business_member(business_id));
drop policy if exists recurring_schedules_insert_own_business on public.recurring_schedules;
create policy recurring_schedules_insert_own_business on public.recurring_schedules
  for insert with check (public.is_business_member(business_id));
drop policy if exists recurring_schedules_update_own_business on public.recurring_schedules;
create policy recurring_schedules_update_own_business on public.recurring_schedules
  for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop policy if exists recurring_schedules_delete_own_business on public.recurring_schedules;
create policy recurring_schedules_delete_own_business on public.recurring_schedules
  for delete using (public.is_business_owner(business_id));

create trigger set_service_baselines_updated_at
  before update on public.service_baselines
  for each row execute function public.set_updated_at();
create trigger set_recurring_schedules_updated_at
  before update on public.recurring_schedules
  for each row execute function public.set_updated_at();

alter table public.automations drop constraint if exists automations_automation_type_check;
alter table public.automations add constraint automations_automation_type_check
  check (automation_type in ('new_lead_followup', 'due_for_return', 'follow_up_reminder', 'service_reminder', 'recurring_schedule'));
