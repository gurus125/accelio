-- Milestone 1 — business time zone (audit bug #9).
--
-- Timestamps stay in UTC. Every decision that depends on "today", a date
-- or an hour (daily send caps, business hours, recurring reminders,
-- imported visit dates) is now evaluated in this zone by src/lib/dates.ts,
-- never in the server's local time. Default: Asia/Kolkata.
--
-- Idempotent: safe to re-run.

alter table public.businesses
  add column if not exists timezone text not null default 'Asia/Kolkata';

-- Reject anything Postgres doesn't recognise as a zone name. A function
-- (not a subquery) because CHECK constraints can't contain subqueries.
create or replace function public.is_valid_time_zone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

alter table public.businesses drop constraint if exists businesses_timezone_valid;
alter table public.businesses
  add constraint businesses_timezone_valid check (public.is_valid_time_zone(timezone));
