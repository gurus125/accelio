-- Milestone 1 — one phone format everywhere (audit bug #6).
--
-- PROBLEM: manual customer entry stored the phone exactly as typed
-- ("98765 43210"), import stored "+919876543210", the WhatsApp webhook and
-- lead capture stored "919876543210". The (business_id, phone) unique index
-- compared raw strings, so the same person could exist two or three times.
--
-- FIX (app side): every save/match now goes through src/lib/phone.ts
-- `normalizeIndianMobile` -> "+91XXXXXXXXXX".
-- FIX (this migration):
--   1. public.normalize_indian_mobile(text) — SQL twin of that function.
--   2. Rewrites existing customers.phone, leads.phone_normalized,
--      customer_messages.from_phone and businesses.phone to "+91XXXXXXXXXX".
--      A customer row is only rewritten when that would NOT collide with
--      another customer of the same business that already has the
--      normalised number — those pairs are duplicates and are left
--      untouched for the owner to resolve (never auto-merged).
--   3. public.customer_phone_issues — a report (view) of possible
--      duplicates and of phones that can't be read as an Indian mobile.
--
-- Idempotent: safe to re-run (a second run finds nothing left to rewrite).

create or replace function public.normalize_indian_mobile(p_raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text;
begin
  if p_raw is null then
    return null;
  end if;
  d := regexp_replace(p_raw, '\D', '', 'g');
  if length(d) = 14 and left(d, 4) = '0091' then
    d := substr(d, 5);
  elsif length(d) = 13 and left(d, 3) = '910' then
    d := substr(d, 4);
  elsif length(d) = 12 and left(d, 2) = '91' then
    d := substr(d, 3);
  elsif length(d) = 11 and left(d, 1) = '0' then
    d := substr(d, 2);
  end if;
  if d ~ '^[6-9][0-9]{9}$' then
    return '+91' || d;
  end if;
  return null;
end;
$$;

grant execute on function public.normalize_indian_mobile(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- customers.phone — rewrite only rows whose normalised number is unique
-- within the business (counting rows already in canonical form).
-- ---------------------------------------------------------------------------
with candidates as (
  select c.id,
         c.business_id,
         public.normalize_indian_mobile(c.phone) as normalized,
         count(*) over (partition by c.business_id, public.normalize_indian_mobile(c.phone)) as same_number_rows
  from public.customers c
  where public.normalize_indian_mobile(c.phone) is not null
)
update public.customers c
set phone = cand.normalized
from candidates cand
where c.id = cand.id
  and cand.same_number_rows = 1
  and c.phone is distinct from cand.normalized;

-- ---------------------------------------------------------------------------
-- Other phone columns have no uniqueness constraint — normalise in place.
-- ---------------------------------------------------------------------------
update public.leads
set phone_normalized = public.normalize_indian_mobile(coalesce(phone_normalized, phone))
where public.normalize_indian_mobile(coalesce(phone_normalized, phone)) is not null
  and phone_normalized is distinct from public.normalize_indian_mobile(coalesce(phone_normalized, phone));

update public.customer_messages
set from_phone = public.normalize_indian_mobile(from_phone)
where public.normalize_indian_mobile(from_phone) is not null
  and from_phone is distinct from public.normalize_indian_mobile(from_phone);

update public.businesses
set phone = public.normalize_indian_mobile(phone)
where public.normalize_indian_mobile(phone) is not null
  and phone is distinct from public.normalize_indian_mobile(phone);

-- Inbound-message matching now looks customers up by exact phone.
create index if not exists customer_messages_business_id_from_phone_idx
  on public.customer_messages (business_id, from_phone);

-- ---------------------------------------------------------------------------
-- Report: customers the owner should look at. NOT merged automatically.
--   issue = 'duplicate'     -> 2+ customers of one business share a number
--   issue = 'invalid_phone' -> phone can't be read as an Indian mobile
-- security_invoker so the caller's RLS on customers applies — a business
-- only ever sees its own rows.
-- ---------------------------------------------------------------------------
create or replace view public.customer_phone_issues
with (security_invoker = true)
as
select c.business_id,
       c.id as customer_id,
       c.name,
       c.phone,
       public.normalize_indian_mobile(c.phone) as normalized_phone,
       case
         when public.normalize_indian_mobile(c.phone) is null then 'invalid_phone'
         else 'duplicate'
       end as issue,
       c.created_at
from public.customers c
where public.normalize_indian_mobile(c.phone) is null
   or exists (
     select 1 from public.customers other
     where other.business_id = c.business_id
       and other.id <> c.id
       and public.normalize_indian_mobile(other.phone) = public.normalize_indian_mobile(c.phone)
   );

grant select on public.customer_phone_issues to authenticated, service_role;
revoke all on public.customer_phone_issues from anon;
