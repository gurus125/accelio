-- Milestone 1 — customer WhatsApp consent and opt-out (audit bug #5).
--
-- Customers had no consent record at all (only leads did) and nothing
-- handled an inbound "STOP". From now on a customer is messaged — by a
-- manual send, a campaign or an automation — only when
--   whatsapp_consent = true AND opted_out_at IS NULL
-- (see src/lib/consent.ts). Opt-out always wins.
--
--   whatsapp_consent  did the customer agree to WhatsApp messages?
--   consent_source    where that was recorded: manual | import | billing |
--                     whatsapp | lead | legacy
--   consent_at        when consent was recorded
--   opted_out_at      when they replied STOP/UNSUBSCRIBE (cleared by START)
--
-- EXISTING CUSTOMERS are backfilled as NOT consented (consent_source =
-- 'legacy'), because we have no record that they agreed. Automations and
-- campaigns will skip them until consent is recorded. If you DID collect
-- consent for your existing customers, run (once, deliberately):
--   update public.customers
--      set whatsapp_consent = true, consent_at = now()
--    where consent_source = 'legacy' and opted_out_at is null;
--
-- Idempotent: safe to re-run.

alter table public.customers add column if not exists whatsapp_consent boolean not null default false;
alter table public.customers add column if not exists consent_source text;
alter table public.customers add column if not exists consent_at timestamptz;
alter table public.customers add column if not exists opted_out_at timestamptz;

alter table public.customers drop constraint if exists customers_consent_source_check;
alter table public.customers add constraint customers_consent_source_check
  check (consent_source is null or consent_source in ('manual', 'import', 'billing', 'whatsapp', 'lead', 'legacy'));

-- Backfill: only rows that have never had a consent decision recorded.
update public.customers
set consent_source = 'legacy'
where consent_source is null and whatsapp_consent = false and consent_at is null;

-- Common filter for "who can we message" (campaign audiences, automations).
create index if not exists customers_business_id_messageable_idx
  on public.customers (business_id)
  where whatsapp_consent and opted_out_at is null;

-- Leads can reply STOP too.
alter table public.leads add column if not exists opted_out_at timestamptz;
