-- Phase 5: a phone number identifies one customer per business. This backs
-- the CSV/Excel import's duplicate protection with a real database
-- constraint (defense in depth — the app also checks before inserting), and
-- prevents re-importing the same file twice from creating duplicate rows.
create unique index if not exists customers_business_id_phone_key
  on public.customers (business_id, phone);
