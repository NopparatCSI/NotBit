import { afterEach, expect, it } from "vitest";
import { demoViewers } from "@marketplace/shared";
import type { PGlite } from "@electric-sql/pglite";
import { addOffer, createDatabase, fundedEvent, hex, orderId } from "./helpers/database";
let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db=undefined; });
it("counts stored evidence and in-flight reservations once, including partial batches", async () => {
  db=await createDatabase(); await addOffer(db); await db.exec("set role service_role");
  const e=fundedEvent(); await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)",[demoViewers.admin.wallet,e.block_hash,JSON.stringify([e])]);
  const ids:string[]=[];
  for(let i=0;i<5;i++){ const r=await db.query<{id:string}>("select public.reserve_evidence_quota($1,6) as id",[demoViewers.seller.id]); ids.push(r.rows[0].id); }
  await expect(db.query("select public.reserve_evidence_quota($1,1)",[demoViewers.seller.id])).rejects.toThrow("EVIDENCE_QUOTA");
  await db.query("insert into public.evidence(order_id,submitted_by,stage,object_path,file_hash,content_type,size_bytes,upload_reservation_id) values($1,$2,'DELIVERY','quota-proof.png',$3,'image/png',8,$4)",[orderId,demoViewers.seller.id,hex(1),ids[0]]);
  await expect(db.query("select public.reserve_evidence_quota($1,1)",[demoViewers.seller.id])).rejects.toThrow("EVIDENCE_QUOTA");
  await db.query("delete from public.evidence_upload_reservations where id=$1",[ids[1]]);
  await expect(db.query("select public.reserve_evidence_quota($1,6)",[demoViewers.seller.id])).resolves.toBeDefined();
},20_000);
it("does not allow browser users to reserve or release another user's quota",async()=>{
  db=await createDatabase(); await db.exec("set role authenticated");
  await expect(db.query("select public.reserve_evidence_quota($1,1)",[demoViewers.seller.id])).rejects.toThrow("permission denied");
  await expect(db.query("delete from public.evidence_upload_reservations")).rejects.toThrow("permission denied");
},20_000);
