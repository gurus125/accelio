-- Milestone 1 — one WhatsApp number, one business (audit bug #3).
--
-- whatsapp_connections.phone_number_id was not unique across businesses,
-- so two businesses could both be "connected" to the same Meta number:
-- one could send as the other, and the inbound webhook (which picks the
-- business by phone_number_id) could hand one salon's customer replies to
-- another salon.
--
-- From now on a phone_number_id can be CONNECTED for at most one business.
-- Rows in 'error' / 'not_connected' state don't count (a failed attempt
-- must not lock a number away from its real owner).
--
-- If duplicates already exist, the connection that was connected first
-- (oldest created_at) keeps the number and the others are switched to
-- 'error' — their owners will see "reconnect" in Settings. A NOTICE lists
-- any row changed.
--
-- Idempotent: safe to re-run.

do $$
declare
  r record;
begin
  for r in
    select id, business_id, phone_number_id
    from (
      select wc.*,
             row_number() over (partition by phone_number_id order by created_at, id) as rn
      from public.whatsapp_connections wc
      where connection_status = 'connected' and phone_number_id is not null
    ) ranked
    where rn > 1
  loop
    raise notice 'whatsapp_connections %: business % shared phone_number_id % with an earlier connection; set to error',
      r.id, r.business_id, r.phone_number_id;
    update public.whatsapp_connections set connection_status = 'error' where id = r.id;
  end loop;
end $$;

create unique index if not exists whatsapp_connections_connected_phone_number_id_key
  on public.whatsapp_connections (phone_number_id)
  where connection_status = 'connected' and phone_number_id is not null;
