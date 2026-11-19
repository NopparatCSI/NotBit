-- Only the indexer may publish verified payment/status messages. A canonical event
-- owns each message, so replay is idempotent and a reorg removes the old assertion.
alter table public.messages
  add column source_chain integer,
  add column source_escrow public.wallet_address,
  add column source_tx public.hex32,
  add column source_log integer,
  add constraint messages_chain_event_key unique(source_chain,source_escrow,source_tx,source_log),
  add constraint messages_chain_event_fk foreign key(source_chain,source_escrow,source_tx,source_log)
    references public.chain_events(chain_id,escrow_address,tx_hash,log_index) on delete cascade,
  add constraint messages_chain_source_check check (
    (source_chain is null and source_escrow is null and source_tx is null and source_log is null)
    or (kind='SYSTEM' and source_chain is not null and source_escrow is not null and source_tx is not null and source_log is not null)
  );

create function public.reconcile_trade_messages(p_chain integer,p_escrow text)
returns void language sql security invoker set search_path=''
as $$
  insert into public.messages(conversation_id,sender_id,kind,body,created_at,source_chain,source_escrow,source_tx,source_log)
  select f.conversation_id,null,'SYSTEM',
    case e.event_name
      when 'OrderFunded' then 'Deposit confirmed on chain. Funds are in escrow; the seller has 24 hours to confirm delivery.'
      when 'DeliveryConfirmed' then 'Delivery confirmed on chain. The buyer has 48 hours to confirm receipt or open a dispute.'
      when 'OrderInReview' then case when e.payload->>'expired'='true'
        then 'The deadline passed. This order is under staff review; funds remain in escrow.'
        else 'A dispute was confirmed on chain. This order is under staff review; funds remain in escrow.' end
      when 'OrderReleased' then 'Payment released on chain: 95% to the seller and 5% platform fee. A failed transfer remains available as a queued payout.'
      when 'OrderRefunded' then 'Payment refunded to the buyer on chain. A failed transfer remains available as a queued payout.'
    end,
    coalesce(e.block_timestamp,now()),e.chain_id,e.escrow_address,e.tx_hash,e.log_index
  from public.chain_events e
  join public.offers f on f.chain_id=e.chain_id and f.escrow_address=e.escrow_address and f.chain_order_id=e.payload->>'orderId'
  join public.orders o on o.id=f.id and o.on_chain
  where e.chain_id=p_chain and e.escrow_address=lower(p_escrow)
    and e.event_name in ('OrderFunded','DeliveryConfirmed','OrderInReview','OrderReleased','OrderRefunded')
  on conflict(source_chain,source_escrow,source_tx,source_log) do nothing;
$$;
revoke all on function public.reconcile_trade_messages(integer,text) from public,anon,authenticated;
grant execute on function public.reconcile_trade_messages(integer,text) to service_role;
