-- Phase 19 — Production Hardening: atomic quota + dedup reservation.
--
-- WHY THIS MIGRATION EXISTS
-- --------------------------
-- Both AI-message generation and WhatsApp sending were previously enforced
-- with a "count usage, then act" pattern in application code:
--   1. SELECT count(*) ... where created_at >= period_start
--   2. if count >= limit: reject
--   3. (do the OpenAI call / WhatsApp send)
--   4. INSERT a usage/message row
--
-- That is a classic time-of-check-to-time-of-use (TOCTOU) race. Two
-- concurrent requests can both read the same count (e.g. 19), both see
-- 19 < 20, and both proceed — producing 21 recorded generations/messages
-- against a limit of 20. This is exactly the failure mode Phase 19's spec
-- calls out by name: "If usage is 19/20, two simultaneous requests must
-- not incorrectly both pass and produce 21/20 usage."
--
-- The fix is to make "check usage AND reserve a slot" one atomic
-- database operation instead of two round trips from the application.
-- Both functions below take a `pg_advisory_xact_lock` keyed per
-- business+resource, so concurrent callers for the SAME business are
-- serialized for the (sub-millisecond) duration of the check+insert, while
-- callers for DIFFERENT businesses never contend with each other at all.
--
-- WhatsApp additionally folds in duplicate-message detection (previously
-- its own separate check-then-insert race in `findRecentDuplicateMessage`
-- + `createMessageRecord`) into the same atomic operation, under the same
-- lock, so a double-click or retried request can't insert twice.

-- ---------------------------------------------------------------------
-- reserve_ai_generation: atomically checks the AI-generation quota for a
-- business over the current billing period and, if under limit, inserts
-- the usage-log row that counts against it — returning that row's id, or
-- null if the quota is already exhausted.
-- ---------------------------------------------------------------------
create or replace function public.reserve_ai_generation(
  p_business_id uuid,
  p_period_start timestamptz,
  p_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_id uuid;
begin
  -- Authorization: a real signed-in user (auth.uid() is not null) must be
  -- a member of the business they're reserving usage for. Internal
  -- server-to-server callers (service_role — the scheduler, webhooks) have
  -- no user JWT at all, so auth.uid() is null and this check is skipped
  -- for them; they are trusted by virtue of holding the service-role key.
  if auth.uid() is not null and not public.is_business_member(p_business_id) then
    raise exception 'Not authorized for this business.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':ai_generation', 0));

  select count(*) into v_used from public.ai_generation_log
    where business_id = p_business_id and created_at >= p_period_start;

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.ai_generation_log (business_id) values (p_business_id) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- reserve_whatsapp_message: atomically checks (a) whether an identical
-- message was already sent/sending to the same recipient within the
-- dedupe window, and (b) whether the business is under its WhatsApp send
-- quota for the current period — inserting a new 'sending' message row
-- only if neither check blocks it. Returns the (existing or newly
-- inserted) message row plus `is_new_reservation`, or no row at all if
-- the quota is exhausted.
-- ---------------------------------------------------------------------
create or replace function public.reserve_whatsapp_message(
  p_business_id uuid,
  p_customer_id uuid,
  p_lead_id uuid,
  p_opportunity_type text,
  p_message_type text,
  p_template_name text,
  p_content text,
  p_period_start timestamptz,
  p_limit integer,
  p_dedupe_window_seconds integer default 30
) returns table (
  id uuid,
  business_id uuid,
  customer_id uuid,
  lead_id uuid,
  opportunity_type text,
  message_type text,
  template_name text,
  content text,
  status text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  is_new_reservation boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_dedupe_since timestamptz := now() - make_interval(secs => p_dedupe_window_seconds);
begin
  if auth.uid() is not null and not public.is_business_member(p_business_id) then
    raise exception 'Not authorized for this business.' using errcode = '42501';
  end if;
  if num_nonnulls(p_customer_id, p_lead_id) <> 1 then
    raise exception 'Exactly one of customer_id or lead_id is required.';
  end if;

  -- Serialize every reservation attempt for this business's WhatsApp
  -- sends — dedupe check, quota check, and the insert itself all happen
  -- while holding this lock, so no concurrent caller can observe a
  -- pre-insert snapshot.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':whatsapp_send', 0));

  return query
  select m.id, m.business_id, m.customer_id, m.lead_id, m.opportunity_type, m.message_type,
         m.template_name, m.content, m.status, m.provider_message_id, m.error_message, m.sent_at,
         m.created_at, m.updated_at, m.delivered_at, m.read_at, m.failed_at, false as is_new_reservation
  from public.messages m
  where m.business_id = p_business_id
    and m.content = p_content
    and m.status in ('sending', 'sent', 'delivered', 'read')
    and m.created_at >= v_dedupe_since
    and (case when p_customer_id is not null then m.customer_id = p_customer_id else m.lead_id = p_lead_id end)
  order by m.created_at desc
  limit 1;

  if found then
    return;
  end if;

  select count(*) into v_used from public.messages
    where business_id = p_business_id
      and created_at >= p_period_start
      and (sent_at is not null or status = 'sending');

  if v_used >= p_limit then
    return;
  end if;

  return query
  insert into public.messages (business_id, customer_id, lead_id, opportunity_type, message_type, template_name, content, status)
  values (p_business_id, p_customer_id, p_lead_id, p_opportunity_type, p_message_type, p_template_name, p_content, 'sending')
  returning id, business_id, customer_id, lead_id, opportunity_type, message_type, template_name, content, status,
            provider_message_id, error_message, sent_at, created_at, updated_at, delivered_at, read_at, failed_at, true;
end;
$$;

revoke all on function public.reserve_ai_generation(uuid, timestamptz, integer) from public;
revoke all on function public.reserve_whatsapp_message(uuid, uuid, uuid, text, text, text, text, timestamptz, integer, integer) from public;
grant execute on function public.reserve_ai_generation(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.reserve_whatsapp_message(uuid, uuid, uuid, text, text, text, text, timestamptz, integer, integer) to authenticated, service_role;
