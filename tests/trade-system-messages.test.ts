import { afterEach,expect,it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { demoViewers } from "@marketplace/shared";
import { addOffer,createDatabase,fundedEvent,conversationId } from "./helpers/database";
let db:PGlite|undefined;
afterEach(async()=>{await db?.close();db=undefined;});
it("publishes confirmed trade messages once and retracts orphaned assertions without deleting user chat",async()=>{
  db=await createDatabase();await addOffer(db);
  await db.query("insert into public.messages(conversation_id,sender_id,kind,body) values($1,$2,'USER','Original trader message')",[conversationId,demoViewers.buyer.id]);
  await db.exec("set role service_role");const escrow=demoViewers.admin.wallet,event=fundedEvent();
  await db.query("select public.indexer_apply_batch(31337,$1,1,1,$2,$3)",[escrow,event.block_hash,JSON.stringify([event])]);
  for(let n=0;n<2;n++)await db.query("select public.reconcile_trade_messages(31337,$1)",[escrow]);
  expect((await db.query("select kind,source_tx from public.messages where kind='SYSTEM'")).rows).toEqual([{kind:"SYSTEM",source_tx:event.tx_hash}]);
  await db.query("select public.indexer_rewind(31337,$1,1,0,null)",[escrow]);
  expect((await db.query("select kind,body from public.messages")).rows).toEqual([{kind:"USER",body:"Original trader message"}]);
},20000);
it("denies browser invocation and forgery of verified event sources",async()=>{
  db=await createDatabase();
  for(const role of ["anon","authenticated"]){
    await db.exec(`set role ${role}`);
    await expect(db.query("select public.reconcile_trade_messages(31337,$1)",[demoViewers.admin.wallet])).rejects.toThrow("permission denied");
    if(role==="authenticated")await expect(db.query("insert into public.messages(conversation_id,kind,body,source_chain) values($1,'SYSTEM','Fake deposit',31337)",[conversationId])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
},20000);
