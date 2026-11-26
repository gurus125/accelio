-- Phase 10: simple campaigns/follow-ups. Builds on Phase 6 (opportunity
-- engine), Phase 7 (AI generation), Phase 8 (WhatsApp send), and Phase 9
-- (delivery/reply tracking) — no new send or tracking infrastructure is
-- created here. Safe to re-run.

-- ============================================================================
-- campaigns — one row per campaign/follow-up the owner creates. Sending
-- always requires an explicit "Approve" then "Send" (see the app-level
-- status machine in lib/campaigns/) — nothing here auto-sends.
-- ============================================================================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  campaign_type text not null check (campaign_type in (
    'custom', 'inactive_customers', 'due_for_return', 'high_value_inactive', 'follow_up', 'service_reminder'
  )),
  status text not null default 'draft' check (status in (
    'draft', 'review', 'approved', 'sending', 'completed', 'failed', 'cancelled'
  )),
  message_template text,
  tone text check (tone in ('friendly', 'professional', 'warm')),
  language text check (language in ('english', 'hinglish')),
  created_by uuid not null references auth.users(id),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_business_id_idx on public.campaigns(business_id);
create index if not exists campaigns_business_id_created_at_idx on public.campaigns(business_id, created_at desc);

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;

drop policy if exists "campaigns_select_own_business" on public.campaigns;
create policy "campaigns_select_own_business" on public.campaigns
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "campaigns_insert_own_business" on public.campaigns;
create policy "campaigns_insert_own_business" on public.campaigns
  for insert with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "campaigns_update_own_business" on public.campaigns;
create policy "campaigns_update_own_business" on public.campaigns
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- No delete policy — a cancelled campaign stays in history rather than
-- disappearing, matching the Phase 8 "messages are never deleted" rule.

-- ============================================================================
-- campaign_recipients — the stable, deduplicated audience list for one
-- campaign. `message_id` links a recipient to the real outbound `messages`
-- row once sent — recipient status mirrors that message's real Phase 9
-- lifecycle (see lib/campaigns/ + the Phase 9 webhook handlers, which this
-- migration extends to also update the linked recipient row) rather than
-- inventing a second, independent tracking system.
-- ============================================================================
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'selected' check (status in (
    'selected', 'ready', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped'
  )),
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, customer_id)
);

create index if not exists campaign_recipients_campaign_id_idx on public.campaign_recipients(campaign_id);
create index if not exists campaign_recipients_business_id_idx on public.campaign_recipients(business_id);
create index if not exists campaign_recipients_customer_id_idx on public.campaign_recipients(customer_id);
create index if not exists campaign_recipients_message_id_idx on public.campaign_recipients(message_id);

drop trigger if exists campaign_recipients_set_updated_at on public.campaign_recipients;
create trigger campaign_recipients_set_updated_at
  before update on public.campaign_recipients
  for each row execute function public.set_updated_at();

-- Defense in depth, same pattern as customer_events/messages: force
-- campaign_recipients.business_id to always match its campaign's real
-- business_id, regardless of application-layer bugs.
create or replace function public.set_campaign_recipient_business_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owning_business_id uuid;
begin
  select business_id into owning_business_id
  from public.campaigns
  where id = new.campaign_id;

  if owning_business_id is null then
    raise exception 'campaign_id % does not exist', new.campaign_id;
  end if;

  new.business_id = owning_business_id;
  return new;
end;
$$;

drop trigger if exists campaign_recipients_set_business_id on public.campaign_recipients;
create trigger campaign_recipients_set_business_id
  before insert or update of campaign_id on public.campaign_recipients
  for each row execute function public.set_campaign_recipient_business_id();

alter table public.campaign_recipients enable row level security;

drop policy if exists "campaign_recipients_select_own_business" on public.campaign_recipients;
create policy "campaign_recipients_select_own_business" on public.campaign_recipients
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "campaign_recipients_insert_own_business" on public.campaign_recipients;
create policy "campaign_recipients_insert_own_business" on public.campaign_recipients
  for insert with check (
    customer_id in (
      select id from public.customers
      where business_id in (select id from public.businesses where owner_id = auth.uid())
    )
  );

drop policy if exists "campaign_recipients_update_own_business" on public.campaign_recipients;
create policy "campaign_recipients_update_own_business" on public.campaign_recipients
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Delete is allowed (removing a recipient from the preview before sending
-- begins) — the application layer enforces that this only happens while
-- the campaign is still draft/review, RLS only enforces business ownership.
drop policy if exists "campaign_recipients_delete_own_business" on public.campaign_recipients;
create policy "campaign_recipients_delete_own_business" on public.campaign_recipients
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );
