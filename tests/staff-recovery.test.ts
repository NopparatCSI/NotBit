import { afterEach, expect, it } from "vitest";
import { demoViewers, toChainId } from "@marketplace/shared";
import type { PGlite } from "@electric-sql/pglite";
import { addOffer, createDatabase, fundedEvent, hex, orderId } from "./helpers/database";
let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db = undefined; });
it("recovers missed staff history from confirmed events once and preserves reorg history", async () => {
  db = await createDatabase(); await addOffer(db); await db.exec("set role service_role");
  const escrow = demoViewers.admin.wallet, funded = fundedEvent();
  const event = (name: string, index: number, payload: object) => ({ ...funded, tx_hash: hex(30), block_number: 2, block_hash: hex(2002), log_index: index, event_name: name, payload });
  const events = [funded,
    event("OrderInReview",0,{orderId:toChainId(orderId),actor:demoViewers.buyer.wallet,expired:false}),
    event("DisputeResolved",1,{orderId:toChainId(orderId),resolver:demoViewers.admin.wallet,refundBuyer:true,decisionHash:hex(9)}),
    event("OrderRefunded",2,{orderId:toChainId(orderId),amount:"10000000000000000"})];
  await db.query("select public.indexer_apply_batch(31337,$1,1,2,$2,$3)",[escrow,hex(2002),JSON.stringify(events)]);
  for(let i=0;i<2;i++) await db.query("select public.reconcile_staff_activity(31337,$1)",[escrow]);
  expect((await db.query("select status from public.staff_transactions")).rows).toEqual([{status:"CONFIRMED"}]);
  expect((await db.query("select action from public.audit_logs order by id")).rows).toEqual([{action:"DECISION_CONFIRMED"}]);
  await db.query("select public.indexer_rewind(31337,$1,2,1,$2)",[escrow,funded.block_hash]);
  await db.query("select public.reconcile_staff_activity(31337,$1)",[escrow]);
  expect((await db.query("select status from public.staff_transactions")).rows).toEqual([{status:"ORPHANED"}]);
  expect((await db.query("select action from public.audit_logs order by id")).rows).toEqual([{action:"DECISION_CONFIRMED"},{action:"TRANSACTION_REORGED"}]);
},20_000);
it("denies browser access to staff transaction storage and recovery", async () => {
  db=await createDatabase();
  for(const role of ["anon","authenticated"]){
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from public.staff_transactions")).rejects.toThrow("permission denied");
    await expect(db.query("select public.reconcile_staff_activity(31337,$1)",[demoViewers.admin.wallet])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
},20_000);

it("rolls back failed-transaction finalization when its audit cannot be written",async()=>{
  db=await createDatabase();
  await db.query("insert into public.staff_transactions(chain_id,escrow_address,tx_hash,staff_id,staff_wallet,action) values(31337,$1,$2,$3,$1,'FUNDING_PAUSE')",[demoViewers.admin.wallet,hex(99),demoViewers.admin.id]);
  await db.exec("create function public.reject_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable'; end;$$; create trigger reject_audit before insert on public.audit_logs for each row execute function public.reject_audit(); set role service_role");
  await expect(db.query("select public.mark_staff_transaction_failed(31337,$1,$2)",[demoViewers.admin.wallet,hex(99)])).rejects.toThrow("audit unavailable");
  expect((await db.query("select status from public.staff_transactions")).rows).toEqual([{status:"SUBMITTED"}]);
  await db.exec("reset role; drop trigger reject_audit on public.audit_logs; set role service_role");
  for(let i=0;i<2;i++)await db.query("select public.mark_staff_transaction_failed(31337,$1,$2)",[demoViewers.admin.wallet,hex(99)]);
  expect((await db.query("select status from public.staff_transactions")).rows).toEqual([{status:"FAILED"}]);
  expect((await db.query("select action from public.audit_logs")).rows).toEqual([{action:"TRANSACTION_FAILED"}]);
},20_000);
