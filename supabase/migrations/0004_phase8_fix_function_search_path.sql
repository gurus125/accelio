-- Pins search_path on the Phase 8 trigger function, matching the pattern
-- already used for set_updated_at / set_customer_event_business_id — fixes
-- the "Function Search Path Mutable" security advisory.
alter function public.set_message_business_id() set search_path = '';
