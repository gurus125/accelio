-- Phase 13 — website lead capture & intent tracking.
--
-- NOTE: this file is a backfilled record of a migration that was applied
-- directly to the live Supabase project during Phase 13 without also being
-- saved into this repo's migrations folder (an oversight discovered while
-- inspecting the codebase at the start of Phase 14). It reconstructs the
-- live schema as closely as possible from the actual applied objects
-- (`information_schema`, `pg_policies`, `pg_indexes`) so `supabase/migrations/`
-- accurately reflects what Phase 13 shipped. It is NOT re-applied to the
-- already-migrated live project — Phase 14's own migration is the next new
-- one on top of this recorded baseline.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text,
  phone text,
  phone_normalized text,
  email text,
  source text not null default 'website' check (source in (
    'website', 'website_brochure', 'website_pricing', 'website_contact', 'website_booking', 'manual', 'other'
  )),
  source_url text,
  interest text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'qualified', 'converted', 'lost')),
  consent_status text check (consent_status in ('given', 'not_recorded')),
  consent_text text,
  consent_given_at timestamptz,
  captured_at timestamptz not null default now(),
  last_contacted_at timestamptz,
  converted_at timestamptz,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_has_contact_info check (phone is not null or email is not null)
);

create index if not exists leads_business_id_idx on public.leads(business_id);
create index if not exists leads_business_id_created_at_idx on public.leads(business_id, created_at desc);
create index if not exists leads_business_id_status_idx on public.leads(business_id, status);
create index if not exists leads_business_id_phone_normalized_idx on public.leads(business_id, phone_normalized);
create index if not exists leads_customer_id_idx on public.leads(customer_id) where customer_id is not null;

create table if not exists public.lead_widgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  widget_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  button_text text not null default 'Get pricing on WhatsApp',
  intro_text text,
  consent_text text not null default 'By submitting your number, you agree to receive the requested information on WhatsApp.',
  default_source text not null default 'website' check (default_source in (
    'website', 'website_brochure', 'website_pricing', 'website_contact', 'website_booking'
  )),
  interest_options text[] not null default '{}',
  accent_color text not null default '#16a34a',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_widgets_widget_key_idx on public.lead_widgets(widget_key);

alter table public.messages alter column customer_id drop not null;
alter table public.messages add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.messages add constraint messages_customer_or_lead_check check (num_nonnulls(customer_id, lead_id) = 1);
create index if not exists messages_lead_id_idx on public.messages(lead_id) where lead_id is not null;

alter table public.customer_messages add column if not exists lead_id uuid references public.leads(id) on delete set null;
create index if not exists customer_messages_lead_id_idx on public.customer_messages(lead_id) where lead_id is not null;

alter table public.leads enable row level security;
alter table public.lead_widgets enable row level security;

create policy leads_select_own_business on public.leads
  for select using (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy leads_insert_own_business on public.leads
  for insert with check (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy leads_update_own_business on public.leads
  for update using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

create policy lead_widgets_select_own_business on public.lead_widgets
  for select using (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy lead_widgets_insert_own_business on public.lead_widgets
  for insert with check (business_id in (select id from public.businesses where owner_id = auth.uid()));
create policy lead_widgets_update_own_business on public.lead_widgets
  for update using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

drop policy if exists messages_insert_own_business on public.messages;
create policy messages_insert_own_business on public.messages
  for insert with check (
    (customer_id is not null and customer_id in (
      select id from public.customers where business_id in (select id from public.businesses where owner_id = auth.uid())
    ))
    or
    (lead_id is not null and lead_id in (
      select id from public.leads where business_id in (select id from public.businesses where owner_id = auth.uid())
    ))
  );
