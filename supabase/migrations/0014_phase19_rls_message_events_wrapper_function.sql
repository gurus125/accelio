-- Missed in 0013_phase19_rls_use_wrapper_functions: message_events has
-- the same inline business_members/auth.uid() subquery pattern as the
-- other 14 tables fixed there. Same semantics, same fix. Caught by
-- re-running the Supabase performance advisor immediately after 0013,
-- which still showed one remaining auth_rls_initplan finding.
alter policy message_events_select_own_business on public.message_events
  using (public.is_business_member(business_id));
