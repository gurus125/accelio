-- Milestone 1 — owner membership (audit bug #1).
--
-- PROBLEM: since Phase 15 every RLS policy and every app query resolves
-- access through public.business_members, but nothing ever inserted the
-- owner's own row when a business was created. A brand-new signup could
-- insert its `businesses` row (businesses_insert_own only checks
-- owner_id = auth.uid()) and was then locked out of it: it could not even
-- SELECT the row it had just created, so onboarding looped forever.
--
-- FIX:
--   1. An AFTER INSERT trigger on businesses creates the owner's
--      business_members row (role 'owner', status 'active') in the same
--      transaction. SECURITY DEFINER because business_members' own insert
--      policy requires the caller to already be an owner — the exact
--      chicken-and-egg this fixes.
--   2. A one-off backfill for every existing business that has no owner
--      membership row yet.
--   3. businesses_select_own also lets the literal owner_id see their row,
--      so an INSERT ... RETURNING (which checks SELECT policies before AFTER
--      triggers run) can never fail for the creator.
--
-- Idempotent: safe to re-run.

create or replace function public.create_owner_membership_for_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text;
begin
  select u.email,
         nullif(trim(coalesce(u.raw_user_meta_data ->> 'owner_name', '')), '')
    into v_email, v_name
  from auth.users u
  where u.id = new.owner_id;

  insert into public.business_members (business_id, user_id, role, status, name, email)
  values (
    new.id,
    new.owner_id,
    'owner',
    'active',
    coalesce(new.owner_name, v_name),
    coalesce(v_email, '')
  )
  on conflict (business_id, user_id) do update
    set role = 'owner', status = 'active';

  return new;
end;
$$;

revoke all on function public.create_owner_membership_for_business() from public;

drop trigger if exists businesses_create_owner_membership on public.businesses;
create trigger businesses_create_owner_membership
  after insert on public.businesses
  for each row execute function public.create_owner_membership_for_business();

-- Backfill: every business whose owner has no membership row at all gets
-- one. A business whose owner row exists but was suspended or demoted is
-- deliberately left alone — that was a human decision, not this bug.
insert into public.business_members (business_id, user_id, role, status, name, email)
select b.id,
       b.owner_id,
       'owner',
       'active',
       b.owner_name,
       coalesce(u.email, '')
from public.businesses b
left join auth.users u on u.id = b.owner_id
where not exists (
  select 1 from public.business_members bm
  where bm.business_id = b.id and bm.user_id = b.owner_id
)
on conflict (business_id, user_id) do nothing;

-- The creator can always read the row they own, even in the instant
-- between INSERT and the trigger above (INSERT ... RETURNING).
drop policy if exists businesses_select_own on public.businesses;
create policy businesses_select_own on public.businesses
  for select using (
    public.is_business_member(id) or owner_id = (select auth.uid())
  );
