-- Milestone 2 — WhatsApp message templates (audit bug #2).
--
-- WhatsApp only delivers free-form text inside the 24-hour "customer
-- service window" after the customer's last message. Everything else —
-- reminders, offers, review requests, bills, the owner's digest — must be
-- an approved template. Before this, the app supported at most ONE template
-- from an env var (WHATSAPP_TEMPLATE_NAME) with two fixed variables.
--
--   message_templates   one row per business x template x language x
--                       variant, with its Meta name, category, body with
--                       {{1}}..{{n}} placeholders, the variable each
--                       placeholder maps to, and its approval status.
--   businesses.whatsapp_language   en | hi | hinglish (default en)
--   businesses.discreet_reminders  parlour "discreet" mode: reminders never
--                                  name the service
--
-- Every business (existing and new) is seeded with the defaults from
-- src/lib/templates/catalog.ts — status 'draft' until submitted to Meta
-- and approved (Settings -> WhatsApp templates).
--
-- Idempotent: safe to re-run (never overwrites an existing row or a
-- setting the owner changed).

-- ---------------------------------------------------------------------------
-- Business settings
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists whatsapp_language text not null default 'en';
alter table public.businesses drop constraint if exists businesses_whatsapp_language_check;
alter table public.businesses add constraint businesses_whatsapp_language_check
  check (whatsapp_language in ('en', 'hi', 'hinglish'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'discreet_reminders'
  ) then
    alter table public.businesses add column discreet_reminders boolean not null default false;
    -- First run only: parlours start in discreet mode. Re-runs never undo an
    -- owner's choice.
    update public.businesses set discreet_reminders = true
    where business_type ~* '(parlou?r|beauty)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- message_templates
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null check (key in ('return_reminder', 'offer', 'review_request', 'whatsapp_bill', 'owner_daily_digest')),
  language text not null check (language in ('en', 'hi', 'hinglish')),
  meta_language_code text not null,
  variant text not null default 'standard' check (variant in ('standard', 'discreet')),
  name text not null check (name ~ '^[a-z0-9_]+$' and length(name) <= 512),
  category text not null check (category in ('marketing', 'utility')),
  body text not null check (length(body) between 1 and 1024),
  variables text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'paused')),
  provider_template_id text,
  rejection_reason text,
  status_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_templates_business_key_language_variant_key
  on public.message_templates (business_id, key, language, variant);
create index if not exists message_templates_business_id_idx on public.message_templates (business_id);
create index if not exists message_templates_business_id_status_idx on public.message_templates (business_id, key, status);

drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;

drop policy if exists message_templates_select_member on public.message_templates;
create policy message_templates_select_member on public.message_templates
  for select using (public.is_business_member(business_id));
drop policy if exists message_templates_insert_owner on public.message_templates;
create policy message_templates_insert_owner on public.message_templates
  for insert with check (public.is_business_owner(business_id));
drop policy if exists message_templates_update_owner on public.message_templates;
create policy message_templates_update_owner on public.message_templates
  for update using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists message_templates_delete_owner on public.message_templates;
create policy message_templates_delete_owner on public.message_templates
  for delete using (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- Seeding: defaults generated from src/lib/templates/catalog.ts
-- (scripts/templates-tests.ts checks this list matches the catalog).
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_message_templates(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_templates
    (business_id, key, language, meta_language_code, variant, name, category, body, variables)
  select p_business_id, d.key, d.language, d.meta_language_code, d.variant, d.name, d.category, d.body, d.variables
  from (values
-- BEGIN GENERATED TEMPLATE SEED
    ('return_reminder', 'en', 'en', 'standard', 'accelio_return_reminder_v1', 'marketing', 'Hi {{1}}, it''s been a while since your last {{2}} at {{3}}. Reply to this message to book your next visit. Reply STOP to stop these messages.', array['customer_first_name', 'service', 'business_name']::text[]),
    ('return_reminder', 'hi', 'hi', 'standard', 'accelio_return_reminder_v1', 'marketing', 'नमस्ते {{1}}, {{2}} पर आपकी पिछली {{3}} को काफ़ी समय हो गया है। अगली विज़िट बुक करने के लिए इस मैसेज का जवाब दें। मैसेज बंद करने के लिए STOP भेजें।', array['customer_first_name', 'business_name', 'service']::text[]),
    ('return_reminder', 'hinglish', 'en', 'standard', 'accelio_return_reminder_hinglish_v1', 'marketing', 'Hi {{1}}, aapka last {{2}} {{3}} par kaafi din pehle hua tha. Agla visit book karne ke liye is message ka reply karein. Messages band karne ke liye STOP bhejein.', array['customer_first_name', 'service', 'business_name']::text[]),
    ('return_reminder', 'en', 'en', 'discreet', 'accelio_return_reminder_discreet_v1', 'marketing', 'Hi {{1}}, it''s time for your next visit at {{2}}. Reply to this message to book a slot. Reply STOP to stop these messages.', array['customer_first_name', 'business_name']::text[]),
    ('return_reminder', 'hi', 'hi', 'discreet', 'accelio_return_reminder_discreet_v1', 'marketing', 'नमस्ते {{1}}, {{2}} पर आपकी अगली विज़िट का समय हो गया है। स्लॉट बुक करने के लिए इस मैसेज का जवाब दें। मैसेज बंद करने के लिए STOP भेजें।', array['customer_first_name', 'business_name']::text[]),
    ('return_reminder', 'hinglish', 'en', 'discreet', 'accelio_return_reminder_discreet_hinglish_v1', 'marketing', 'Hi {{1}}, {{2}} par aapke agle visit ka time ho gaya hai. Slot book karne ke liye is message ka reply karein. Messages band karne ke liye STOP bhejein.', array['customer_first_name', 'business_name']::text[]),
    ('offer', 'en', 'en', 'standard', 'accelio_offer_v1', 'marketing', 'Hi {{1}}, {{2}} has a special offer for you: {{3}}. Reply to this message to book. Reply STOP to stop these messages.', array['customer_first_name', 'business_name', 'offer_text']::text[]),
    ('offer', 'hi', 'hi', 'standard', 'accelio_offer_v1', 'marketing', 'नमस्ते {{1}}, {{2}} की ओर से आपके लिए खास ऑफ़र: {{3}}। बुक करने के लिए इस मैसेज का जवाब दें। मैसेज बंद करने के लिए STOP भेजें।', array['customer_first_name', 'business_name', 'offer_text']::text[]),
    ('offer', 'hinglish', 'en', 'standard', 'accelio_offer_hinglish_v1', 'marketing', 'Hi {{1}}, {{2}} ki taraf se aapke liye special offer: {{3}}. Book karne ke liye is message ka reply karein. Messages band karne ke liye STOP bhejein.', array['customer_first_name', 'business_name', 'offer_text']::text[]),
    ('review_request', 'en', 'en', 'standard', 'accelio_review_request_v1', 'marketing', 'Hi {{1}}, thank you for visiting {{2}}. How was your experience? Reply with a rating from 1 to 5. Your feedback helps us serve you better.', array['customer_first_name', 'business_name']::text[]),
    ('review_request', 'hi', 'hi', 'standard', 'accelio_review_request_v1', 'marketing', 'नमस्ते {{1}}, {{2}} आने के लिए धन्यवाद। आपका अनुभव कैसा रहा? 1 से 5 के बीच रेटिंग भेजें। आपकी राय से हमें बेहतर सेवा देने में मदद मिलती है।', array['customer_first_name', 'business_name']::text[]),
    ('review_request', 'hinglish', 'en', 'standard', 'accelio_review_request_hinglish_v1', 'marketing', 'Hi {{1}}, {{2}} aane ke liye shukriya! Aapka experience kaisa raha? 1 se 5 ke beech rating bhejein. Aapke feedback se hum aur behtar service de paayenge.', array['customer_first_name', 'business_name']::text[]),
    ('whatsapp_bill', 'en', 'en', 'standard', 'accelio_whatsapp_bill_v1', 'utility', 'Hi {{1}}, thank you for visiting {{2}}. Your bill: {{3}}. Total: ₹{{4}} on {{5}}. Please keep this message for your records.', array['customer_first_name', 'business_name', 'bill_items', 'bill_total', 'bill_date']::text[]),
    ('whatsapp_bill', 'hi', 'hi', 'standard', 'accelio_whatsapp_bill_v1', 'utility', 'नमस्ते {{1}}, {{2}} आने के लिए धन्यवाद। आपका बिल: {{3}}। कुल: ₹{{4}}, तारीख़ {{5}}। कृपया यह मैसेज अपने रिकॉर्ड के लिए रखें।', array['customer_first_name', 'business_name', 'bill_items', 'bill_total', 'bill_date']::text[]),
    ('whatsapp_bill', 'hinglish', 'en', 'standard', 'accelio_whatsapp_bill_hinglish_v1', 'utility', 'Hi {{1}}, {{2}} aane ke liye shukriya. Aapka bill: {{3}}. Total: ₹{{4}}, date {{5}}. Ye message apne record ke liye rakh lijiye.', array['customer_first_name', 'business_name', 'bill_items', 'bill_total', 'bill_date']::text[]),
    ('owner_daily_digest', 'en', 'en', 'standard', 'accelio_owner_daily_digest_v1', 'utility', 'Good morning {{1}}. {{2}} customers of {{3}} are due to return today, worth about ₹{{4}}. Open Accelio to review and send their reminders.', array['owner_first_name', 'due_count', 'business_name', 'estimated_amount']::text[]),
    ('owner_daily_digest', 'hi', 'hi', 'standard', 'accelio_owner_daily_digest_v1', 'utility', 'सुप्रभात {{1}}। आज {{2}} के {{3}} ग्राहक दोबारा आने वाले हैं, लगभग ₹{{4}} के। रिमाइंडर देखने और भेजने के लिए Accelio खोलें।', array['owner_first_name', 'business_name', 'due_count', 'estimated_amount']::text[]),
    ('owner_daily_digest', 'hinglish', 'en', 'standard', 'accelio_owner_daily_digest_hinglish_v1', 'utility', 'Good morning {{1}}. Aaj {{2}} ke {{3}} customers wapas aane wale hain, lagbhag ₹{{4}} ke. Reminders dekhne aur bhejne ke liye Accelio kholiye.', array['owner_first_name', 'business_name', 'due_count', 'estimated_amount']::text[])
-- END GENERATED TEMPLATE SEED
  ) as d(key, language, meta_language_code, variant, name, category, body, variables)
  on conflict (business_id, key, language, variant) do nothing;
end;
$$;

revoke all on function public.seed_default_message_templates(uuid) from public;

create or replace function public.seed_message_templates_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_message_templates(new.id);
  return new;
end;
$$;

revoke all on function public.seed_message_templates_for_new_business() from public;

drop trigger if exists businesses_seed_message_templates on public.businesses;
create trigger businesses_seed_message_templates
  after insert on public.businesses
  for each row execute function public.seed_message_templates_for_new_business();

-- Backfill every existing business.
do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform public.seed_default_message_templates(b.id);
  end loop;
end $$;
