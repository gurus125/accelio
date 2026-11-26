-- Phase 19 hardening: standardize RLS policies on the existing
-- is_business_member()/is_business_owner() wrapper functions instead of
-- inline `business_id IN (SELECT ... FROM business_members WHERE
-- user_id = auth.uid() AND status = 'active' [AND role = 'owner'])`
-- subqueries.
--
-- WHY: Supabase's own performance linter (auth_rls_initplan) flagged 47
-- policies across these 14 tables for re-evaluating auth.uid() once per
-- row instead of once per query. Five other tables (business_members,
-- business_invitations, subscriptions, team_audit_log, billing_events —
-- all added in Phase 15/16/18) already use is_business_member()/
-- is_business_owner() and are NOT flagged, because Postgres treats a
-- STABLE function call as an initplan candidate.
--
-- This migration does not change authorization logic at all: each new
-- policy expression is the exact same predicate the old inline subquery
-- expressed — "a business_members row exists for this user, this
-- business, status='active'" (member) or the same plus "role='owner'"
-- (owner) — just expressed via the functions the rest of the codebase
-- already uses. Verified after applying (see Phase 19 report) with a
-- functional RLS smoke test impersonating a real authenticated user via
-- request.jwt.claims: own business/customers remained visible, an
-- unrelated business_id remained hidden, and an unfiltered `select *
-- from businesses` still returned only the caller's own row.
--
-- Using ALTER POLICY rather than DROP+CREATE keeps each policy's name
-- and table-attachment intact and applies atomically within this
-- migration's transaction.
alter policy businesses_select_own on public.businesses
  using (public.is_business_member(id));
alter policy businesses_update_own on public.businesses
  using (public.is_business_owner(id)) with check (public.is_business_owner(id));
alter policy businesses_delete_own on public.businesses
  using (public.is_business_owner(id));
alter policy businesses_insert_own on public.businesses
  with check ((select auth.uid()) = owner_id);

alter policy customers_select_own_business on public.customers
  using (public.is_business_member(business_id));
alter policy customers_insert_own_business on public.customers
  with check (public.is_business_member(business_id));
alter policy customers_update_own_business on public.customers
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
alter policy customers_delete_own_business on public.customers
  using (public.is_business_owner(business_id));

alter policy customer_events_select_own_business on public.customer_events
  using (public.is_business_member(business_id));
alter policy customer_events_insert_own_business on public.customer_events
  with check (customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id)));
alter policy customer_events_update_own_business on public.customer_events
  using (public.is_business_member(business_id))
  with check (customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id)));
alter policy customer_events_delete_own_business on public.customer_events
  using (public.is_business_owner(business_id));

alter policy customer_messages_select_own_business on public.customer_messages
  using (public.is_business_member(business_id));
alter policy customer_messages_update_own_business on public.customer_messages
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

alter policy messages_select_own_business on public.messages
  using (public.is_business_member(business_id));
alter policy messages_insert_own_business on public.messages
  with check (
    ((customer_id is not null) and (customer_id in (select c.id from public.customers c where public.is_business_member(c.business_id))))
    or
    ((lead_id is not null) and (lead_id in (select l.id from public.leads l where public.is_business_member(l.business_id))))
  );
alter policy messages_update_own_business on public.messages
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

alter policy leads_select_own_business on public.leads
  using (public.is_business_member(business_id));
alter policy leads_insert_own_business on public.leads
  with check (public.is_business_member(business_id));
alter policy leads_update_own_business on public.leads
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

alter policy lead_widgets_select_own_business on public.lead_widgets
  using (public.is_business_member(business_id));
alter policy lead_widgets_insert_own_business on public.lead_widgets
  with check (public.is_business_owner(business_id));
alter policy lead_widgets_update_own_business on public.lead_widgets
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

alter policy campaigns_select_own_business on public.campaigns
  using (public.is_business_member(business_id));
alter policy campaigns_insert_own_business on public.campaigns
  with check (public.is_business_owner(business_id));
alter policy campaigns_update_own_business on public.campaigns
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

alter policy campaign_recipients_select_own_business on public.campaign_recipients
  using (public.is_business_member(business_id));
alter policy campaign_recipients_insert_own_business on public.campaign_recipients
  with check (customer_id in (select c.id from public.customers c where public.is_business_owner(c.business_id)));
alter policy campaign_recipients_update_own_business on public.campaign_recipients
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
alter policy campaign_recipients_delete_own_business on public.campaign_recipients
  using (public.is_business_owner(business_id));

alter policy automations_select_own_business on public.automations
  using (public.is_business_member(business_id));
alter policy automations_insert_own_business on public.automations
  with check (public.is_business_owner(business_id));
alter policy automations_update_own_business on public.automations
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

alter policy automation_runs_select_own_business on public.automation_runs
  using (public.is_business_member(business_id));

alter policy whatsapp_connections_select_own_business on public.whatsapp_connections
  using (public.is_business_owner(business_id));
alter policy whatsapp_connections_insert_own_business on public.whatsapp_connections
  with check (public.is_business_owner(business_id));
alter policy whatsapp_connections_update_own_business on public.whatsapp_connections
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
alter policy whatsapp_connections_delete_own_business on public.whatsapp_connections
  using (public.is_business_owner(business_id));

alter policy service_baselines_select_own_business on public.service_baselines
  using (public.is_business_member(business_id));
alter policy service_baselines_insert_own_business on public.service_baselines
  with check (public.is_business_member(business_id));
alter policy service_baselines_update_own_business on public.service_baselines
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
alter policy service_baselines_delete_own_business on public.service_baselines
  using (public.is_business_owner(business_id));

alter policy recurring_schedules_select_own_business on public.recurring_schedules
  using (public.is_business_member(business_id));
alter policy recurring_schedules_insert_own_business on public.recurring_schedules
  with check (public.is_business_member(business_id));
alter policy recurring_schedules_update_own_business on public.recurring_schedules
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
alter policy recurring_schedules_delete_own_business on public.recurring_schedules
  using (public.is_business_owner(business_id));
