-- Developer 3 demo data for the LOCAL Supabase only. Never run this on the team's cloud project.
--
-- Creates demo users, listings, chats, offers, and simulated escrow events on a fake escrow
-- (chain 31337, 0x…d3d3), then runs them through public.indexer_apply_batch exactly like the
-- real indexer. Result: six orders in every state the staff console shows.
--
-- Optional: put the wallet of a SECOND MetaMask account (not a staff wallet) in v_my_buyer_wallet
-- below. Sign in with it once at /account first. It becomes the buyer of the DELIVERED and the
-- buyer-disputed orders, so you can test evidence uploads as that buyer.
--
-- Run it once in Studio > SQL Editor. To start over: npx supabase db reset (then re-add staff_wallets).

create or replace function marketplace_private.dev3_demo_event(
  p_tx integer, p_block bigint, p_at timestamptz, p_name text, p_payload jsonb
) returns jsonb language sql as $$
  select jsonb_build_object(
    'tx_hash', '0x' || lpad(to_hex(p_tx), 64, '0'), 'log_index', 0, 'block_number', p_block,
    'block_hash', '0x' || lpad(to_hex(p_block), 64, 'd'), 'block_timestamp', p_at,
    'event_name', p_name, 'payload', p_payload)
$$;

do $$
declare
  v_my_buyer_wallet text := null; -- e.g. '0xabc…' (lowercase), or leave null
  v_escrow constant text := '0x000000000000000000000000000000000000d3d3';
  v_chain constant integer := 31337;
  v_buyer uuid := 'd3000000-0000-4000-8000-000000000001';
  v_seller constant uuid := 'd3000000-0000-4000-8000-000000000002';
  v_admin constant uuid := 'd3000000-0000-4000-8000-000000000003';
  v_my_buyer uuid;
  v_now constant timestamptz := date_trunc('minute', now());
  v_events jsonb := '[]';
  v_order record;
  v_seq integer := 0;
  v_split text;
begin
  if exists (select 1 from public.chain_checkpoints where chain_id = v_chain and escrow_address = v_escrow) then
    raise notice 'Demo data is already loaded. Run npx supabase db reset to start over.';
    return;
  end if;

  if v_my_buyer_wallet is not null then
    select id into v_my_buyer from public.users where wallet = lower(v_my_buyer_wallet);
    if v_my_buyer is null then
      raise exception 'Sign in at /account with % first, then run this again.', v_my_buyer_wallet;
    end if;
    if exists (select 1 from public.staff_wallets where wallet = lower(v_my_buyer_wallet)) then
      raise exception 'Use a non-staff wallet for v_my_buyer_wallet. Staff wallets cannot trade.';
    end if;
  end if;

  insert into auth.users (id) values (v_buyer), (v_seller), (v_admin) on conflict do nothing;
  insert into public.users (id, wallet, display_name) values
    (v_buyer, '0x00000000000000000000000000000000000d3b01', 'Demo Buyer'),
    (v_seller, '0x00000000000000000000000000000000000d3501', 'Demo Seller'),
    (v_admin, '0x00000000000000000000000000000000000d3a01', 'Demo Admin')
  on conflict do nothing;

  -- n, game, title, amount, buyer, minutes since funding, and what happened after funding.
  for v_order in
    select * from (values
      (1, 'counter-strike-2', 'AK-47 | Redline (Field-Tested)', '10000000000000000', true, 30 * 60, 'buyer_dispute'),
      (2, 'team-fortress-2', 'Unusual Burning Flames Team Captain', '50000000000000000', false, 30 * 60, 'expired_review'),
      (3, 'warframe', 'Rhino Prime Set', '20000000000000000', false, 28 * 60, 'overdue'),
      (4, 'dota-2', 'Arcana: Manifold Paradox', '15000000000000000', true, 3 * 60, 'delivered'),
      (5, 'rust', 'Tempered AK-47', '8000000000000000', false, 48 * 60, 'released'),
      (6, 'unturned', 'Gold Eaglemaster', '12000000000000000', false, 72 * 60, 'refunded')
    ) as t(n, game, title, amount, mine, age, story)
  loop
    declare
      v_listing uuid := ('d3000000-0000-4000-8001-00000000000' || v_order.n)::uuid;
      v_conversation uuid := ('d3000000-0000-4000-8002-00000000000' || v_order.n)::uuid;
      v_offer uuid := ('d3000000-0000-4000-8003-00000000000' || v_order.n)::uuid;
      v_order_hex text := '0x' || lpad('d3' || to_hex(v_order.n), 64, '0');
      v_listing_hex text := '0x' || lpad(to_hex(100 + v_order.n), 64, '0');
      v_order_buyer uuid := case when v_order.mine and v_my_buyer is not null then v_my_buyer else v_buyer end;
      v_buyer_wallet text;
      v_funded timestamptz := v_now - make_interval(mins => v_order.age);
      v_delivered timestamptz := v_funded + least(interval '4 hours', make_interval(mins => v_order.age / 2));
      v_block bigint := v_order.n * 10;
    begin
      select wallet into v_buyer_wallet from public.users where id = v_order_buyer;

      insert into public.listings (id, seller_id, game_slug, title, description, quantity, region, delivery_method, price_wei, created_at)
      values (v_listing, v_seller, v_order.game, v_order.title, 'Demo listing for the Developer 3 staff console.', 1,
        'Asia', 'In-game trade', v_order.amount, v_funded - interval '1 day');
      insert into public.conversations (id, listing_id, buyer_id, seller_id, created_at)
      values (v_conversation, v_listing, v_order_buyer, v_seller, v_funded - interval '1 hour');
      insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
        (v_conversation, v_order_buyer, 'USER', 'Hi, is ' || v_order.title || ' still available?', v_funded - interval '50 minutes'),
        (v_conversation, v_seller, 'USER', 'Yes. Send me your trade link and I will make an offer.', v_funded - interval '45 minutes'),
        (v_conversation, v_order_buyer, 'USER', 'Here it is: DemoTrader#4821. Tonight at 20:00 works for me.', v_funded - interval '40 minutes'),
        (v_conversation, null, 'SYSTEM', 'Deposit confirmed on-chain. Funds are held in escrow.', v_funded + interval '1 minute');
      if v_order.story = 'buyer_dispute' then
        insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
          (v_conversation, v_order_buyer, 'USER', 'The skin I received is Battle-Scarred, not Field-Tested.', v_now - interval '3 hours'),
          (v_conversation, v_seller, 'USER', 'That is the one in the listing photo. I will not refund.', v_now - interval '150 minutes');
      end if;

      insert into public.offers (id, conversation_id, listing_id, buyer_id, seller_id, chain_id, escrow_address,
        chain_order_id, chain_listing_id, amount_wei, agreement, agreement_hash, seller_signature, created_at, expires_at)
      values (v_offer, v_conversation, v_listing, v_order_buyer, v_seller, v_chain, v_escrow, v_order_hex, v_listing_hex,
        v_order.amount,
        jsonb_build_object('title', v_order.title, 'quantity', 1, 'gameSlug', v_order.game, 'region', 'Asia',
          'buyerCharacter', 'DemoTrader#4821', 'sellerCharacter', 'DemoSeller#1001',
          'deliveryMethod', 'In-game trade', 'meetingTime', to_char((v_funded + interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        '0x' || lpad(to_hex(200 + v_order.n), 64, '0'), '0x' || repeat('1', 130),
        v_funded - interval '10 minutes', v_funded + interval '20 minutes');

      v_seq := v_seq + 1;
      v_events := v_events || marketplace_private.dev3_demo_event(v_seq, v_block, v_funded, 'OrderFunded', jsonb_build_object(
        'orderId', v_order_hex, 'listingId', v_listing_hex, 'buyer', v_buyer_wallet,
        'seller', '0x00000000000000000000000000000000000d3501', 'amount', v_order.amount,
        'deadline', extract(epoch from v_funded + interval '24 hours')::bigint::text,
        'agreementHash', '0x' || lpad(to_hex(200 + v_order.n), 64, '0')));

      if v_order.story in ('buyer_dispute', 'delivered', 'released', 'refunded') then
        v_seq := v_seq + 1;
        v_events := v_events || marketplace_private.dev3_demo_event(v_seq, v_block + 1, v_delivered, 'DeliveryConfirmed',
          jsonb_build_object('orderId', v_order_hex, 'deadline', extract(epoch from v_delivered + interval '48 hours')::bigint::text,
            'evidenceHash', '0x' || lpad(to_hex(300 + v_order.n), 64, '0')));
      end if;
      if v_order.story = 'buyer_dispute' then
        v_seq := v_seq + 1;
        v_events := v_events || marketplace_private.dev3_demo_event(v_seq, v_block + 2, v_now - interval '2 hours', 'OrderInReview',
          jsonb_build_object('orderId', v_order_hex, 'actor', v_buyer_wallet, 'expired', false));
      elsif v_order.story = 'expired_review' then
        v_seq := v_seq + 1;
        v_events := v_events || marketplace_private.dev3_demo_event(v_seq, v_block + 2, v_funded + interval '25 hours', 'OrderInReview',
          jsonb_build_object('orderId', v_order_hex, 'actor', '0x00000000000000000000000000000000000d3e01', 'expired', true));
      elsif v_order.story = 'released' then
        v_split := (v_order.amount::numeric * 500 / 10000)::bigint::text;
        v_seq := v_seq + 1;
        v_events := v_events
          || marketplace_private.dev3_demo_event(v_seq, v_block + 2, v_delivered + interval '1 hour', 'ReceiptConfirmed',
            jsonb_build_object('orderId', v_order_hex, 'evidenceHash', '0x' || lpad(to_hex(400 + v_order.n), 64, '0')))
          || jsonb_set(marketplace_private.dev3_demo_event(v_seq, v_block + 2, v_delivered + interval '1 hour', 'OrderReleased',
            jsonb_build_object('orderId', v_order_hex, 'sellerAmount', (v_order.amount::numeric - v_split::numeric)::text, 'fee', v_split)),
            '{log_index}', '1');
      elsif v_order.story = 'refunded' then
        v_seq := v_seq + 1;
        v_events := v_events || marketplace_private.dev3_demo_event(v_seq, v_block + 2, v_delivered + interval '2 hours', 'OrderInReview',
          jsonb_build_object('orderId', v_order_hex, 'actor', '0x00000000000000000000000000000000000d3501', 'expired', false));
      end if;
    end;
  end loop;

  -- Batch 1: everything up to the reviews. Orders must exist before a decision draft can point at them.
  perform public.indexer_apply_batch(v_chain, v_escrow, 1, 99, '0x' || lpad(to_hex(99), 64, 'd'), v_events);
  -- Reasons the parties wrote before sending openDispute (the dispute API stores these).
  update public.disputes set reason = 'Seller delivered a Battle-Scarred skin instead of the Field-Tested one in the agreement.'
  where order_id = 'd3000000-0000-4000-8003-000000000001';
  update public.disputes set reason = 'Buyer never accepted the trade request.'
  where order_id = 'd3000000-0000-4000-8003-000000000006';

  -- Order 6: a staff decision to refund, recorded the same way the decision API does.
  insert into public.decision_drafts (order_id, staff_id, staff_wallet, refund_buyer, reason, decision_hash, created_at)
  values ('d3000000-0000-4000-8003-000000000006', v_admin, '0x00000000000000000000000000000000000d3a01', true,
    'Chat shows the buyer asked to cancel before delivery and the seller agreed. Full refund.',
    '0x' || lpad('d3dec6', 64, '0'), v_now - interval '20 hours');
  perform public.indexer_apply_batch(v_chain, v_escrow, 100, 120, '0x' || lpad(to_hex(120), 64, 'd'), jsonb_build_array(
    marketplace_private.dev3_demo_event(900, 100, v_now - interval '20 hours', 'DisputeResolved', jsonb_build_object(
      'orderId', '0x' || lpad('d36', 64, '0'), 'resolver', '0x00000000000000000000000000000000000d3a01',
      'refundBuyer', true, 'decisionHash', '0x' || lpad('d3dec6', 64, '0'))),
    jsonb_set(marketplace_private.dev3_demo_event(900, 100, v_now - interval '20 hours', 'OrderRefunded', jsonb_build_object(
      'orderId', '0x' || lpad('d36', 64, '0'), 'amount', '12000000000000000')), '{log_index}', '1')));

  raise notice 'Loaded 6 demo orders. Open /admin with your staff wallet.';
end;
$$;

drop function marketplace_private.dev3_demo_event(integer, bigint, timestamptz, text, jsonb);