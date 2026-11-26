-- Phase 11: analytics. No new tables — every analytics number is derived
-- from existing Phase 4/8/9/10 tables (businesses, customers,
-- customer_events, messages, customer_messages, campaigns,
-- campaign_recipients). This migration only adds indexes that the new
-- analytics queries actually need (date-range + status filtering scoped
-- by business), per the Phase 11 spec's instruction not to blindly add
-- indexes. Safe to re-run.

-- Analytics filters messages by business + status (sent/delivered/read)
-- and by business + sent_at for date-range queries and reactivation
-- ("qualifying outreach") lookups. The existing
-- messages_business_id_created_at_idx doesn't cover either.
create index if not exists messages_business_id_status_idx
  on public.messages(business_id, status);

create index if not exists messages_business_id_sent_at_idx
  on public.messages(business_id, sent_at desc);

-- Reactivation attribution walks a customer's outreach messages in order —
-- this is the per-customer equivalent of the index above.
create index if not exists messages_customer_id_sent_at_idx
  on public.messages(customer_id, sent_at desc);

-- customer_events already has separate business_id and occurred_at
-- indexes (Phase 4), but analytics always filters by business AND a date
-- range together (date filter, reactivation window) — a composite index
-- serves that directly instead of relying on the planner to intersect two
-- single-column indexes.
create index if not exists customer_events_business_id_occurred_at_idx
  on public.customer_events(business_id, occurred_at desc);

-- Opportunity-type breakdown (Phase 11 section 19) groups messages by
-- opportunity_type within a business.
create index if not exists messages_business_id_opportunity_type_idx
  on public.messages(business_id, opportunity_type);
