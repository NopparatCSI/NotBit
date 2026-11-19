alter table public.audit_logs add column dedupe_key text unique;
create table public.staff_transactions (
  chain_id integer not null check(chain_id in (11155111,31337)),
  escrow_address public.wallet_address not null,
  tx_hash public.hex32 not null,
  staff_id uuid not null references public.users(id),
  staff_wallet public.wallet_address not null,
  order_id uuid references public.orders(id),
  action text not null check(action in ('DECISION','ESCALATION','FUNDING_PAUSE')),
  payload jsonb not null default '{}',
  status text not null default 'SUBMITTED' check(status in ('SUBMITTED','CONFIRMED','FAILED','UNKNOWN','ORPHANED')),
  confirmed_block_hash public.hex32,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(chain_id,escrow_address,tx_hash)
);
create index staff_transactions_pending_idx on public.staff_transactions(chain_id,escrow_address,updated_at)
  where status in ('SUBMITTED','UNKNOWN','ORPHANED');
alter table public.staff_transactions enable row level security;
revoke all on public.staff_transactions from public,anon,authenticated,service_role;
grant select,insert,update on public.staff_transactions to service_role;
grant update(payload) on public.chain_events to service_role;

create function public.reconcile_staff_activity(p_chain integer,p_escrow text)
returns void language plpgsql security invoker set search_path=''
as $$
declare item record; event record; actor text; kind text; owner_id uuid; owner_role text; order_id uuid; detail jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain::text||':'||lower(p_escrow),0));
  for item in select * from public.staff_transactions t
    where t.chain_id=p_chain and t.escrow_address=lower(p_escrow) and t.status='CONFIRMED'
      and not exists(select 1 from public.chain_events e where e.chain_id=t.chain_id and e.escrow_address=t.escrow_address
        and e.tx_hash=t.tx_hash and e.block_hash=t.confirmed_block_hash)
  loop
    update public.staff_transactions set status='ORPHANED',updated_at=now()
      where chain_id=item.chain_id and escrow_address=item.escrow_address and tx_hash=item.tx_hash;
    insert into public.audit_logs(staff_id,order_id,action,details,dedupe_key)
      values(item.staff_id,item.order_id,'TRANSACTION_REORGED',jsonb_build_object('txHash',item.tx_hash,'chainId',p_chain,'wallet',item.staff_wallet),
        p_chain||':'||lower(p_escrow)||':'||item.tx_hash||':reorg:'||item.confirmed_block_hash) on conflict(dedupe_key) do nothing;
  end loop;
  for event in select * from public.chain_events e where e.chain_id=p_chain and e.escrow_address=lower(p_escrow)
    and e.event_name in ('DisputeResolved','OrderInReview','FundingPauseChanged') order by e.block_number,e.log_index
  loop
    actor := lower(case when event.event_name='DisputeResolved' then event.payload->>'resolver' else event.payload->>'actor' end);
    kind := case when event.event_name='DisputeResolved' then 'DECISION' when event.event_name='FundingPauseChanged' then 'FUNDING_PAUSE'
      when event.payload->>'expired'='true' then 'ESCALATION' else null end;
    if actor is null or kind is null then continue; end if;
    select u.id,s.role::text into owner_id,owner_role from public.users u join public.staff_wallets s on s.wallet=u.wallet where u.wallet=actor;
    if owner_id is null then continue; end if;
    select o.id into order_id from public.orders o where o.chain_id=p_chain and o.escrow_address=lower(p_escrow) and o.chain_order_id=event.payload->>'orderId';
    detail := jsonb_strip_nulls(jsonb_build_object('txHash',event.tx_hash,'chainId',p_chain,'escrowAddress',lower(p_escrow),
      'wallet',actor,'role',owner_role,'paused',event.payload->'paused','refundBuyer',event.payload->'refundBuyer','reconciled',true));
    insert into public.staff_transactions(chain_id,escrow_address,tx_hash,staff_id,staff_wallet,order_id,action,payload,status,confirmed_block_hash)
      values(p_chain,lower(p_escrow),event.tx_hash,owner_id,actor,order_id,kind,detail,'CONFIRMED',event.block_hash)
      on conflict(chain_id,escrow_address,tx_hash) do update set status='CONFIRMED',confirmed_block_hash=excluded.confirmed_block_hash,
        payload=excluded.payload,updated_at=now()
      where staff_transactions.status<>'CONFIRMED' or staff_transactions.confirmed_block_hash is distinct from excluded.confirmed_block_hash;
    insert into public.audit_logs(staff_id,order_id,action,details,dedupe_key)
      values(owner_id,order_id,kind||'_CONFIRMED',detail,
        p_chain||':'||lower(p_escrow)||':'||event.tx_hash||':'||kind||':'||event.block_hash) on conflict(dedupe_key) do nothing;
  end loop;
end;
$$;
revoke all on function public.reconcile_staff_activity(integer,text) from public,anon,authenticated;
grant execute on function public.reconcile_staff_activity(integer,text) to service_role;
