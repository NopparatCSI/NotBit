grant usage on schema marketplace_private to service_role;
-- A full rewind removes the checkpoint so the indexer restarts from the deploy block.
grant delete on public.chain_checkpoints to service_role;
grant select on public.staff_wallets to service_role;

-- Chain events carry the block time so funded_at and review times use chain time.
alter table public.chain_events add column block_timestamp timestamptz;
create index chain_events_order_idx on public.chain_events (chain_id, escrow_address, (payload ->> 'orderId'));

-- Mirror of IEscrow.Order plus settlement results from OrderReleased / OrderRefunded.
alter table public.orders
  add column chain_order_id public.hex32,
  add column buyer_wallet public.wallet_address,
  add column seller_wallet public.wallet_address,
  -- Existing orders need their offer amount before the non-null domain is applied.
  add column amount_wei text,
  add column agreement_hash public.hex32,
  add column delivery_hash public.hex32,
  add column receipt_hash public.hex32,
  add column decision_hash public.hex32,
  add column review_actor public.wallet_address,
  add column review_expired boolean,
  add column in_review_at timestamptz,
  add column resolver_wallet public.wallet_address,
  add column refund_buyer boolean,
  add column resolved_at timestamptz,
  add column seller_amount_wei text check (seller_amount_wei ~ '^(0|[1-9][0-9]{0,77})$'),
  add column fee_wei text check (fee_wei ~ '^(0|[1-9][0-9]{0,77})$'),
  add column settled_at timestamptz,
  add column last_event_block bigint,
  -- False when a reorg removed the funding event. Rows stay because evidence references them.
  add column on_chain boolean not null default true;

update public.orders as o set
  chain_order_id = f.chain_order_id,
  buyer_wallet = bu.wallet,
  seller_wallet = su.wallet,
  amount_wei = f.amount_wei,
  agreement_hash = f.agreement_hash
from public.offers as f
join public.users as bu on bu.id = f.buyer_id
join public.users as su on su.id = f.seller_id
where f.id = o.id;

alter table public.orders alter column amount_wei type public.positive_wei
  using amount_wei::public.positive_wei;
create unique index orders_chain_order_idx on public.orders (chain_id, escrow_address, chain_order_id);

-- Disputes keep the party's reason (written before the openDispute transaction) and the
-- on-chain review / decision. Expired escalations have no opener or reason.
alter table public.disputes drop constraint disputes_check;
alter table public.disputes
  add column expired boolean,
  add column in_review_at timestamptz,
  add column resolver_wallet public.wallet_address;

-- Preserve decisions recorded before the chain projection columns existed.
update public.disputes as d set resolver_wallet = u.wallet
from public.users as u where u.id = d.resolved_by and d.resolved_at is not null;

update public.orders as o set resolved_at = d.resolved_at, resolver_wallet = d.resolver_wallet,
  refund_buyer = d.refund_buyer, decision_hash = d.decision_hash
from public.disputes as d where d.order_id = o.id and d.resolved_at is not null;

alter table public.disputes
  add constraint disputes_reason_length check (reason is null or char_length(btrim(reason)) between 1 and 2000),
  add constraint disputes_resolution_check check (
    (resolved_at is null and resolved_by is null and resolver_wallet is null and refund_buyer is null
      and decision_reason is null and decision_hash is null)
    or (resolved_at is not null and resolver_wallet is not null and refund_buyer is not null
      and decision_hash is not null and decision_reason is not null and length(btrim(decision_reason)) > 0)
  );

-- One signed receipt per upload batch. evidence_ids keeps the order used by hashEvidence.
create table public.evidence_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  submitted_by uuid not null references public.users (id),
  submitter_wallet public.wallet_address not null,
  stage public.evidence_stage not null check (stage in ('DELIVERY', 'RECEIPT')),
  evidence_ids uuid[] not null check (cardinality(evidence_ids) between 1 and 10),
  evidence_hash public.hex32 not null,
  signature text not null check (signature ~ '^0x[0-9a-f]{130}$'),
  created_at timestamptz not null default now()
);
create index evidence_receipts_order_idx on public.evidence_receipts (order_id, created_at);
create index evidence_submitter_recent_idx on public.evidence (submitted_by, created_at);

-- A staff member stores the reason and its hash before sending resolveDispute.
create table public.decision_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  staff_id uuid not null references public.users (id),
  staff_wallet public.wallet_address not null,
  refund_buyer boolean not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  decision_hash public.hex32 not null,
  created_at timestamptz not null default now(),
  unique (order_id, staff_wallet, decision_hash)
);

-- Tracks escalateExpiredOrder transactions sent by the background job so a pending
-- transaction is not resent every minute.
create table public.order_escalations (
  order_id uuid primary key references public.orders (id),
  tx_hash public.hex32,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz not null default now()
);

alter table public.evidence_receipts enable row level security;
alter table public.decision_drafts enable row level security;
alter table public.order_escalations enable row level security;

-- These tables are only reached through server routes that check the session first.
revoke all on public.evidence_receipts, public.decision_drafts, public.order_escalations
  from public, anon, authenticated, service_role;
grant select, insert on public.evidence_receipts, public.decision_drafts to service_role;
grant select, insert, update on public.order_escalations to service_role;

-- Rebuild one order from its events. Deterministic, so replays and rewinds are safe.
create function marketplace_private.rebuild_order(p_chain_id integer, p_escrow text, p_chain_order_id text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_offer_id uuid;
  v_listing_id uuid;
  v_chain_listing_id text;
  v_offer_amount text;
  v_ev record;
  v_funded boolean := false;
  v_status public.order_status;
  v_deadline timestamptz;
  v_funded_at timestamptz;
  v_buyer text;
  v_seller text;
  v_amount text;
  v_agreement text;
  v_delivery text;
  v_receipt text;
  v_decision text;
  v_review_actor text;
  v_review_expired boolean;
  v_in_review_at timestamptz;
  v_resolver text;
  v_refund boolean;
  v_resolved_at timestamptz;
  v_seller_amount text;
  v_fee text;
  v_settled_at timestamptz;
  v_last_block bigint;
  v_actor_user uuid;
  v_resolver_user uuid;
  v_draft_staff uuid;
  v_draft_reason text;
begin
  select o.id, o.listing_id, o.chain_listing_id, o.amount_wei
    into v_offer_id, v_listing_id, v_chain_listing_id, v_offer_amount
  from public.offers as o
  where o.chain_id = p_chain_id and o.escrow_address = lower(p_escrow) and o.chain_order_id = lower(p_chain_order_id);
  if not found then
    return;
  end if;

  for v_ev in
    select e.event_name, e.payload, e.block_number, coalesce(e.block_timestamp, now()) as at
    from public.chain_events as e
    where e.chain_id = p_chain_id and e.escrow_address = lower(p_escrow)
      and e.payload ->> 'orderId' = lower(p_chain_order_id)
    order by e.block_number, e.log_index
  loop
    case v_ev.event_name
      when 'OrderFunded' then
        -- The seller signed the offer stored in NOTBIT. Ignore funding that does not match it.
        if v_ev.payload ->> 'listingId' <> v_chain_listing_id or v_ev.payload ->> 'amount' <> v_offer_amount then
          raise warning 'OrderFunded % does not match the stored offer', p_chain_order_id;
          continue;
        end if;
        v_funded := true;
        v_status := 'FUNDED';
        v_deadline := to_timestamp((v_ev.payload ->> 'deadline')::bigint);
        v_funded_at := v_ev.at;
        v_buyer := v_ev.payload ->> 'buyer';
        v_seller := v_ev.payload ->> 'seller';
        v_amount := v_ev.payload ->> 'amount';
        v_agreement := v_ev.payload ->> 'agreementHash';
      when 'DeliveryConfirmed' then
        v_status := 'DELIVERED';
        v_deadline := to_timestamp((v_ev.payload ->> 'deadline')::bigint);
        v_delivery := v_ev.payload ->> 'evidenceHash';
      when 'ReceiptConfirmed' then
        v_receipt := v_ev.payload ->> 'evidenceHash';
      when 'OrderInReview' then
        v_status := 'IN_REVIEW';
        v_review_actor := v_ev.payload ->> 'actor';
        v_review_expired := (v_ev.payload ->> 'expired')::boolean;
        v_in_review_at := v_ev.at;
      when 'DisputeResolved' then
        v_resolver := v_ev.payload ->> 'resolver';
        v_refund := (v_ev.payload ->> 'refundBuyer')::boolean;
        v_decision := v_ev.payload ->> 'decisionHash';
        v_resolved_at := v_ev.at;
      when 'OrderReleased' then
        v_status := 'RELEASED';
        v_seller_amount := v_ev.payload ->> 'sellerAmount';
        v_fee := v_ev.payload ->> 'fee';
        v_settled_at := v_ev.at;
      when 'OrderRefunded' then
        v_status := 'REFUNDED';
        v_seller_amount := '0';
        v_fee := '0';
        v_settled_at := v_ev.at;
      else
        null;
    end case;
    if v_funded then
      v_last_block := v_ev.block_number;
    end if;
  end loop;

  if not v_funded then
    -- A reorg removed the deposit. Keep the row for evidence and history, but hide it.
    update public.orders set on_chain = false, updated_at = now() where id = v_offer_id and on_chain;
    -- Dispute rows are never deleted. Clear only what came from the removed events.
    update public.disputes set expired = null, in_review_at = null, resolved_at = null, resolver_wallet = null,
      resolved_by = null, refund_buyer = null, decision_hash = null, decision_reason = null
    where order_id = v_offer_id;
    update public.offers set status = case when expires_at > now() then 'OPEN'::public.offer_status
      else 'EXPIRED'::public.offer_status end
    where id = v_offer_id and status = 'FUNDED';
    update public.listings set status = 'ACTIVE'
    where id = v_listing_id and status = 'SOLD' and not exists (
      select 1 from public.orders as other
      where other.listing_id = v_listing_id and other.on_chain and other.id <> v_offer_id
    );
    return;
  end if;

  insert into public.orders as o (
    id, listing_id, chain_id, escrow_address, status, deadline, funded_at, updated_at, chain_order_id,
    buyer_wallet, seller_wallet, amount_wei, agreement_hash, delivery_hash, receipt_hash, decision_hash,
    review_actor, review_expired, in_review_at, resolver_wallet, refund_buyer, resolved_at,
    seller_amount_wei, fee_wei, settled_at, last_event_block, on_chain
  ) values (
    v_offer_id, v_listing_id, p_chain_id, lower(p_escrow), v_status, v_deadline, v_funded_at, now(),
    lower(p_chain_order_id), v_buyer, v_seller, v_amount, v_agreement, v_delivery, v_receipt, v_decision,
    v_review_actor, v_review_expired, v_in_review_at, v_resolver, v_refund, v_resolved_at,
    v_seller_amount, v_fee, v_settled_at, v_last_block, true
  )
  on conflict (id) do update set
    status = excluded.status, deadline = excluded.deadline, funded_at = excluded.funded_at,
    updated_at = now(), chain_order_id = excluded.chain_order_id, buyer_wallet = excluded.buyer_wallet,
    seller_wallet = excluded.seller_wallet, amount_wei = excluded.amount_wei,
    agreement_hash = excluded.agreement_hash, delivery_hash = excluded.delivery_hash,
    receipt_hash = excluded.receipt_hash, decision_hash = excluded.decision_hash,
    review_actor = excluded.review_actor, review_expired = excluded.review_expired,
    in_review_at = excluded.in_review_at, resolver_wallet = excluded.resolver_wallet,
    refund_buyer = excluded.refund_buyer, resolved_at = excluded.resolved_at,
    seller_amount_wei = excluded.seller_amount_wei, fee_wei = excluded.fee_wei,
    settled_at = excluded.settled_at, last_event_block = excluded.last_event_block, on_chain = true
  where (o.status, o.deadline, o.delivery_hash, o.receipt_hash, o.decision_hash, o.in_review_at,
      o.resolved_at, o.settled_at, o.last_event_block, o.on_chain)
    is distinct from (excluded.status, excluded.deadline, excluded.delivery_hash, excluded.receipt_hash,
      excluded.decision_hash, excluded.in_review_at, excluded.resolved_at, excluded.settled_at,
      excluded.last_event_block, true);

  update public.offers set status = 'FUNDED' where id = v_offer_id and status <> 'FUNDED';
  update public.listings set status = 'SOLD' where id = v_listing_id and status <> 'SOLD';

  if v_in_review_at is not null then
    select u.id into v_actor_user from public.users as u where u.wallet = v_review_actor;
    insert into public.disputes (order_id, opened_by, created_at)
    values (v_offer_id, case when v_review_expired then null else v_actor_user end, v_in_review_at)
    on conflict (order_id) do nothing;
    update public.disputes set expired = v_review_expired, in_review_at = v_in_review_at,
      opened_by = coalesce(opened_by, case when v_review_expired then null else v_actor_user end)
    where order_id = v_offer_id;
  else
    update public.disputes set expired = null, in_review_at = null
    where order_id = v_offer_id and in_review_at is not null;
  end if;

  if v_resolved_at is not null then
    select d.staff_id, d.reason into v_draft_staff, v_draft_reason
    from public.decision_drafts as d
    where d.order_id = v_offer_id and d.decision_hash = v_decision
    order by (d.staff_wallet = v_resolver) desc, d.created_at
    limit 1;
    select u.id into v_resolver_user from public.users as u where u.wallet = v_resolver;
    insert into public.disputes (order_id, created_at) values (v_offer_id, v_resolved_at)
    on conflict (order_id) do nothing;
    update public.disputes set
      resolved_at = v_resolved_at,
      resolver_wallet = v_resolver,
      resolved_by = coalesce(v_draft_staff, v_resolver_user),
      refund_buyer = v_refund,
      decision_hash = v_decision,
      decision_reason = coalesce(v_draft_reason, 'Resolved on-chain without a reason recorded in NOTBIT.')
    where order_id = v_offer_id;
  else
    update public.disputes set resolved_at = null, resolver_wallet = null, resolved_by = null,
      refund_buyer = null, decision_hash = null, decision_reason = null
    where order_id = v_offer_id and resolved_at is not null;
  end if;
end;
$$;
revoke all on function marketplace_private.rebuild_order(integer, text, text) from public, anon, authenticated;
grant execute on function marketplace_private.rebuild_order(integer, text, text) to service_role;

-- Store a range of confirmed logs, rebuild every order they touch, and move the
-- checkpoint, all in one transaction. p_from_block must continue the checkpoint.
create function public.indexer_apply_batch(
  p_chain_id integer, p_escrow text, p_from_block bigint, p_to_block bigint, p_to_hash text, p_events jsonb
)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  v_checkpoint bigint;
  v_inserted integer;
  v_order text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':' || lower(p_escrow), 0));
  if p_to_block < p_from_block then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'INVALID_EVENTS' using errcode = '22023';
  end if;

  select c.block_number into v_checkpoint from public.chain_checkpoints as c
  where c.chain_id = p_chain_id and c.escrow_address = lower(p_escrow) for update;
  if found and p_from_block <> v_checkpoint + 1 then
    raise exception 'CHECKPOINT_MOVED' using errcode = '40001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_events) as x
    where (x ->> 'block_number')::bigint not between p_from_block and p_to_block
  ) then
    raise exception 'EVENT_OUTSIDE_RANGE' using errcode = '22023';
  end if;

  insert into public.chain_events (
    chain_id, escrow_address, tx_hash, log_index, block_number, block_hash, block_timestamp, event_name, payload
  )
  select p_chain_id, lower(p_escrow), lower(x.tx_hash), x.log_index, x.block_number, lower(x.block_hash),
    x.block_timestamp, x.event_name, x.payload
  from jsonb_to_recordset(p_events) as x(
    tx_hash text, log_index integer, block_number bigint, block_hash text, block_timestamp timestamptz,
    event_name text, payload jsonb
  )
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  for v_order in
    select distinct x -> 'payload' ->> 'orderId' from jsonb_array_elements(p_events) as x
    where x -> 'payload' ? 'orderId'
    union
    -- Self-heal: funding indexed before the offer row reached the database.
    select o.chain_order_id from public.offers as o
    join public.chain_events as e on e.chain_id = o.chain_id and e.escrow_address = o.escrow_address
      and e.event_name = 'OrderFunded' and e.payload ->> 'orderId' = o.chain_order_id
    where o.chain_id = p_chain_id and o.escrow_address = lower(p_escrow) and o.status <> 'FUNDED'
  loop
    perform marketplace_private.rebuild_order(p_chain_id, p_escrow, v_order);
  end loop;

  insert into public.chain_checkpoints (chain_id, escrow_address, block_number, block_hash)
  values (p_chain_id, lower(p_escrow), p_to_block, lower(p_to_hash))
  on conflict (chain_id, escrow_address)
    do update set block_number = excluded.block_number, block_hash = excluded.block_hash;
  return v_inserted;
end;
$$;
revoke all on function public.indexer_apply_batch(integer, text, bigint, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.indexer_apply_batch(integer, text, bigint, bigint, text, jsonb) to service_role;

-- Undo events after the common ancestor of a reorg, rebuild the affected orders, and
-- move the checkpoint back in one transaction. A null ancestor hash rewinds fully.
create function public.indexer_rewind(
  p_chain_id integer, p_escrow text, p_expected_block bigint, p_ancestor_block bigint, p_ancestor_hash text
)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  v_checkpoint bigint;
  v_orders text[];
  v_order text;
  v_deleted integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':' || lower(p_escrow), 0));
  select c.block_number into v_checkpoint from public.chain_checkpoints as c
  where c.chain_id = p_chain_id and c.escrow_address = lower(p_escrow) for update;
  if not found or v_checkpoint <> p_expected_block or p_ancestor_block >= v_checkpoint then
    raise exception 'CHECKPOINT_MOVED' using errcode = '40001';
  end if;

  select array_agg(distinct e.payload ->> 'orderId') into v_orders from public.chain_events as e
  where e.chain_id = p_chain_id and e.escrow_address = lower(p_escrow)
    and e.block_number > p_ancestor_block and e.payload ? 'orderId';

  delete from public.chain_events as e
  where e.chain_id = p_chain_id and e.escrow_address = lower(p_escrow) and e.block_number > p_ancestor_block;
  get diagnostics v_deleted = row_count;

  if p_ancestor_hash is null then
    delete from public.chain_checkpoints where chain_id = p_chain_id and escrow_address = lower(p_escrow);
  else
    update public.chain_checkpoints set block_number = p_ancestor_block, block_hash = lower(p_ancestor_hash)
    where chain_id = p_chain_id and escrow_address = lower(p_escrow);
  end if;

  foreach v_order in array coalesce(v_orders, '{}') loop
    perform marketplace_private.rebuild_order(p_chain_id, p_escrow, v_order);
  end loop;
  return v_deleted;
end;
$$;
revoke all on function public.indexer_rewind(integer, text, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.indexer_rewind(integer, text, bigint, bigint, text) to service_role;

-- Escrow-wide state derived from events: queued payouts and the funding pause flag.
create view public.escrow_payout_balances with (security_invoker = true) as
  select e.chain_id, e.escrow_address, e.payload ->> 'recipient' as wallet,
    sum(case when e.event_name = 'PayoutQueued' then (e.payload ->> 'amount')::numeric
      else -(e.payload ->> 'amount')::numeric end)::text as pending_wei
  from public.chain_events as e
  where e.event_name in ('PayoutQueued', 'PayoutWithdrawn')
  group by e.chain_id, e.escrow_address, e.payload ->> 'recipient';

create view public.escrow_funding_state with (security_invoker = true) as
  select distinct on (e.chain_id, e.escrow_address) e.chain_id, e.escrow_address,
    (e.payload ->> 'paused')::boolean as funding_paused, e.block_number, e.block_timestamp
  from public.chain_events as e
  where e.event_name = 'FundingPauseChanged'
  order by e.chain_id, e.escrow_address, e.block_number desc, e.log_index desc;

-- One row per order for the staff review queue and order review page.
create view public.staff_order_overview with (security_invoker = true) as
  select o.id, o.status, o.on_chain, o.deadline, o.funded_at, o.updated_at, o.chain_id, o.escrow_address,
    o.chain_order_id, o.amount_wei, o.buyer_wallet, o.seller_wallet, o.agreement_hash, o.delivery_hash,
    o.receipt_hash, o.decision_hash, o.review_expired, o.in_review_at, o.refund_buyer, o.resolved_at,
    o.seller_amount_wei, o.fee_wei, o.settled_at,
    f.conversation_id, f.agreement, f.buyer_id, f.seller_id,
    l.title as listing_title, l.game_slug, o.listing_id,
    bu.display_name as buyer_name, su.display_name as seller_name,
    d.reason as dispute_reason, d.opened_by as dispute_opened_by, d.created_at as dispute_created_at,
    d.decision_reason, d.resolver_wallet
  from public.orders as o
  join public.offers as f on f.id = o.id
  join public.listings as l on l.id = o.listing_id
  join public.users as bu on bu.id = f.buyer_id
  join public.users as su on su.id = f.seller_id
  left join public.disputes as d on d.order_id = o.id;

revoke all on public.escrow_payout_balances, public.escrow_funding_state, public.staff_order_overview
  from public, anon, authenticated, service_role;
grant select on public.escrow_payout_balances, public.escrow_funding_state, public.staff_order_overview
  to service_role;
