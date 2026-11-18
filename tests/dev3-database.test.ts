import { afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { demoViewers, toChainId } from "@marketplace/shared";
import { addOffer, amount, applyMigrations, createDatabase, fundedEvent, hex, listingId, orderId, replacementId } from "./helpers/database";

let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db = undefined; });
const escrow = demoViewers.admin.wallet;

it("upgrades populated orders and resolved disputes without losing their history", async () => {
  db = await createDatabase("20261116085012");
  await addOffer(db);
  await db.query(`insert into public.orders(id,listing_id,chain_id,escrow_address,status,deadline,funded_at)
    values($1,$2,31337,$3,'REFUNDED',now(),now())`, [orderId, listingId, escrow]);
  await db.query(`insert into public.disputes(order_id,opened_by,reason,resolved_by,refund_buyer,decision_reason,decision_hash,resolved_at)
    values($1,$2,'Original dispute',$3,true,'Original decision',$4,now())`,
    [orderId, demoViewers.buyer.id, demoViewers.admin.id, hex(9)]);
  await applyMigrations(db, "20261116085012");
  expect((await db.query("select amount_wei,chain_order_id,buyer_wallet,seller_wallet from public.orders")).rows).toEqual([{
    amount_wei: amount, chain_order_id: toChainId(orderId), buyer_wallet: demoViewers.buyer.wallet, seller_wallet: demoViewers.seller.wallet,
  }]);
  expect((await db.query("select reason,decision_reason,resolver_wallet from public.disputes")).rows).toEqual([{
    reason: "Original dispute", decision_reason: "Original decision", resolver_wallet: escrow,
  }]);
  expect((await db.query("select id,decision_reason from public.staff_order_overview where resolved_at is not null")).rows)
    .toEqual([{ id: orderId, decision_reason: "Original decision" }]);
  await expect(db.query("update public.orders set amount_wei='0'")).rejects.toThrow("positive_wei_check");
}, 20_000);

it("connects evidence receipts, a saved staff decision, and confirmed events to the review view", async () => {
  db = await createDatabase();
  await addOffer(db);
  await db.exec("set role service_role");
  const funded = fundedEvent();
  await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)", [escrow, funded.block_hash, JSON.stringify([funded])]);
  const evidenceId = "50000000-0000-4000-8000-000000000001";
  await db.query(`insert into public.evidence(id,order_id,submitted_by,stage,object_path,file_hash,content_type,size_bytes)
    values($1,$2,$3,'DELIVERY','order/delivery.png',$4,'image/png',8)`, [evidenceId, orderId, demoViewers.seller.id, hex(8)]);
  await db.query(`insert into public.evidence_receipts(order_id,submitted_by,submitter_wallet,stage,evidence_ids,evidence_hash,signature)
    values($1,$2,$3,'DELIVERY',$4,$5,$6)`, [orderId, demoViewers.seller.id, demoViewers.seller.wallet, [evidenceId], hex(8), "0x" + "1".repeat(130)]);
  const review = { ...funded, tx_hash: hex(2), block_number: 2, block_hash: hex(1002), event_name: "OrderInReview",
    payload: { orderId: toChainId(orderId), actor: demoViewers.buyer.wallet, expired: false } };
  await db.query("select public.indexer_apply_batch(31337,$1,2,2,$2,$3)", [escrow, review.block_hash, JSON.stringify([review])]);
  expect((await db.query("select id from public.staff_order_overview where on_chain and status='IN_REVIEW'")).rows).toEqual([{ id: orderId }]);
  await db.query(`insert into public.decision_drafts(order_id,staff_id,staff_wallet,refund_buyer,reason,decision_hash)
    values($1,$2,$3,true,'Evidence supports refund',$4)`, [orderId, demoViewers.admin.id, escrow, hex(9)]);
  const decision = { ...funded, tx_hash: hex(3), block_number: 3, block_hash: hex(1003), event_name: "DisputeResolved",
    payload: { orderId: toChainId(orderId), resolver: escrow, refundBuyer: true, decisionHash: hex(9) } };
  const refund = { ...decision, log_index: 1, event_name: "OrderRefunded", payload: { orderId: toChainId(orderId), amount } };
  await db.query("select public.indexer_apply_batch(31337,$1,3,3,$2,$3)", [escrow, decision.block_hash, JSON.stringify([decision, refund])]);
  expect((await db.query("select status,refund_buyer,decision_reason,decision_hash from public.staff_order_overview where on_chain and resolved_at is not null")).rows)
    .toEqual([{ status: "REFUNDED", refund_buyer: true, decision_reason: "Evidence supports refund", decision_hash: hex(9) }]);
  expect((await db.query("select evidence_ids from public.evidence_receipts where order_id=$1", [orderId])).rows)
    .toEqual([{ evidence_ids: [evidenceId] }]);
}, 20_000);

it("indexes replacement funding after a reorg while retaining evidence on the orphaned order", async () => {
  db = await createDatabase();
  await addOffer(db);
  await addOffer(db, replacementId);
  await db.exec("set role service_role");
  const original = fundedEvent();
  await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)", [escrow, original.block_hash, JSON.stringify([original])]);
  await db.query(`insert into public.evidence(order_id,submitted_by,stage,object_path,file_hash,content_type,size_bytes)
    values($1,$2,'DELIVERY','original/evidence.png',$3,'image/png',8)`, [orderId, demoViewers.seller.id, hex(8)]);
  await db.query("select public.indexer_rewind(31337,$1,1,0,null)", [escrow]);
  const replacement = fundedEvent(replacementId, 1, 2);
  await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)", [escrow, replacement.block_hash, JSON.stringify([replacement])]);
  expect((await db.query("select id,on_chain from public.orders order by id")).rows).toEqual([
    { id: orderId, on_chain: false }, { id: replacementId, on_chain: true },
  ]);
  expect((await db.query("select order_id,object_path from public.evidence")).rows).toEqual([
    { order_id: orderId, object_path: "original/evidence.png" },
  ]);
  expect((await db.query("select block_number from public.chain_checkpoints")).rows).toEqual([{ block_number: 1 }]);
  // The replacement must not permit two canonical orders for one listing.
  await expect(db.query("update public.orders set on_chain=true where id=$1", [orderId])).rejects.toThrow("orders_canonical_listing_idx");
}, 20_000);

it("keeps projection and checkpoint atomic, rejects a stale run, and deduplicates events", async () => {
  db = await createDatabase();
  await addOffer(db);
  await db.exec("set role service_role");
  const event = fundedEvent();
  const batch = JSON.stringify([event, event]);
  expect((await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3) as inserted", [escrow, event.block_hash, batch])).rows)
    .toEqual([{ inserted: 1 }]);
  await expect(db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)", [escrow, event.block_hash, batch])).rejects.toThrow("CHECKPOINT_MOVED");
  const invalid = { ...fundedEvent(orderId, 2), tx_hash: hex(202), event_name: "DeliveryConfirmed", payload: { orderId: toChainId(orderId), deadline: "invalid", evidenceHash: hex(1) } };
  await expect(db.query("select public.indexer_apply_batch(31337,$1,2,2,$2,$3)", [escrow, hex(1002), JSON.stringify([invalid])])).rejects.toThrow();
  expect((await db.query("select count(*)::integer as count from public.chain_events")).rows).toEqual([{ count: 1 }]);
  expect((await db.query("select status from public.orders")).rows).toEqual([{ status: "FUNDED" }]);
  expect((await db.query("select block_number from public.chain_checkpoints")).rows).toEqual([{ block_number: 1 }]);
}, 20_000);

it("provides staff data through service queries and denies direct access to private tables", async () => {
  db = await createDatabase();
  await addOffer(db);
  await db.exec("set role service_role");
  const event = fundedEvent();
  await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)", [escrow, event.block_hash, JSON.stringify([event])]);
  await db.query(`insert into public.audit_logs(staff_id,order_id,action) values($1,$2,'ORDER_REVIEWED')`, [demoViewers.admin.id, orderId]);
  expect((await db.query("select id,buyer_id,seller_id,listing_title,amount_wei from public.staff_order_overview")).rows).toEqual([{
    id: orderId, buyer_id: demoViewers.buyer.id, seller_id: demoViewers.seller.id, listing_title: "Demo", amount_wei: amount,
  }]);
  await expect(db.query("update public.audit_logs set action='CHANGED'")).rejects.toThrow("permission denied");
  await expect(db.query("delete from public.audit_logs")).rejects.toThrow("permission denied");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    for (const table of ["evidence", "evidence_receipts", "decision_drafts", "staff_order_overview"]) {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow("permission denied");
    }
    await expect(db.query("select public.indexer_apply_batch(31337,$1,2,2,$2,'[]')", [escrow, hex(1)])).rejects.toThrow("permission denied");
  }
}, 20_000);
