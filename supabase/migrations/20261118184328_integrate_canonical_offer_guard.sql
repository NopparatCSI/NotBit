-- Repair environments that already applied Developer 2's nullable-domain variant.
-- Offer snapshots contain the original amount; no value is invented for old orders.
update public.orders as o set amount_wei = f.amount_wei
from public.offers as f where f.id = o.id and o.amount_wei is null;

alter domain public.positive_wei drop constraint positive_wei_check;
alter domain public.positive_wei add constraint positive_wei_check check (
  case when value ~ '^[1-9][0-9]{0,77}$' then
    value::numeric <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
  else false end
);

-- Developer 3 retains orphaned orders for history. They must not prevent a fresh
-- Developer 2 offer when the listing is available again after a chain reorg.
create or replace function marketplace_private.check_offer_listing()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.listings where id = new.listing_id and status = 'ACTIVE' for share;
  if not found then raise exception 'Listing is unavailable' using errcode = '23514'; end if;
  if exists (select 1 from public.orders where listing_id = new.listing_id and on_chain) then
    raise exception 'Listing already funded' using errcode = '23514';
  end if;
  return new;
end;
$$;
