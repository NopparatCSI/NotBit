import { readFileSync } from "node:fs";
import { beforeAll,describe,expect,test } from "vitest";
import { api,login,createDeal,fund,send,index,service,state,client,mine,record } from "./environment";
import { offerTypedData } from "../../src/lib/offers/model";
const {indexerSecret}=JSON.parse(readFileSync(".runtime/acceptance/credentials.json","utf8"));
const headers={Authorization:`Bearer ${indexerSecret}`,"Content-Type":"application/json"};
async function fault(value:unknown){const r=await fetch("http://127.0.0.1:8546/control",{method:"POST",headers,body:JSON.stringify(value)});expect(r.ok).toBe(true);}
async function checkpoint(){return(await service.from("chain_checkpoints").select("block_number").eq("chain_id",31337).eq("escrow_address",state.escrowAddress).single()).data?.block_number;}
beforeAll(async()=>{for(const p of ["buyer","seller","admin"] as const)await login(p);});
describe.sequential("23 persisted indexer and audit recovery",()=>{
  for(const status of [429,0])test(status?"429 recovery without skipping events":"upstream timeout recovery without skipping events",async()=>{
    const deal=await createDeal(status?"rpc-429":"rpc-timeout");
    await send("buyer","fundOrder",[offerTypedData(deal.offer).message,deal.offer.signedOffer.signature],BigInt(deal.offer.signedOffer.amount));
    const before=await checkpoint();await fault({method:"eth_getLogs",remaining:10,status});
    try{
      const r=await fetch(`${state.appUrl}/api/v1/internal/indexer`,{method:"POST",headers});
      expect(r.status).toBe(503);expect(await checkpoint()).toBe(before);
      const injected=await(await fetch("http://127.0.0.1:8546/control",{headers})).json();expect(injected.injected).toBeGreaterThan(0);
    }finally{await fault(null);}
    await index();expect((await api("buyer",`/orders/${deal.offer.id}`)).data.projectionReady).toBe(true);
    await Promise.all([index(),index()]);
    const events=await service.from("chain_events").select("tx_hash,log_index").eq("payload->>orderId",deal.offer.signedOffer.orderId).eq("event_name","OrderFunded");expect(events.data).toHaveLength(1);
    const messages=await service.from("messages").select("id").eq("conversation_id",deal.conversationId).eq("kind","SYSTEM");expect(messages.data).toHaveLength(1);
    record("23-rpc",{passed:true,case:status?"429":"timeout",orderId:deal.offer.id});
  });
  test("actual app process restart resumes checkpoint and reconstructs missing staff audit",async()=>{
    const deal=await createDeal("restart-audit");await fund(deal);await send("buyer","openDispute",[deal.offer.signedOffer.orderId]);await index();
    const draft=await api("admin",`/admin/orders/${deal.offer.id}/decision`,"POST",{refundBuyer:true,reason:"Recover an audit after a process crash"});
    const hash=await send("admin","resolveDispute",[deal.offer.signedOffer.orderId,true,draft.data.decisionHash]);
    // No activity POST: emulate a browser/process crash after broadcast.
    const before=await checkpoint();const previous=await(await fetch("http://127.0.0.1:3202",{headers})).json();
    const restarted=await(await fetch("http://127.0.0.1:3202/restart",{method:"POST",headers})).json();expect(restarted.restarted).toBe(true);expect(restarted.pid).not.toBe(previous.pid);expect(await checkpoint()).toBe(before);
    await index();await index();
    const audits=await service.from("audit_logs").select("id").eq("order_id",deal.offer.id).eq("action","DECISION_CONFIRMED");expect(audits.data).toHaveLength(1);
    const tx=await service.from("staff_transactions").select("status").eq("tx_hash",hash).single();expect(tx.data?.status).toBe("CONFIRMED");
    record("23-restart",{passed:true,orderId:deal.offer.id,hash});
  });
  test("real alternate fork removes stale status/messages, preserves audit, and replays once",async()=>{
    const deal=await createDeal("reorg");await fund(deal);await send("buyer","openDispute",[deal.offer.signedOffer.orderId]);await index();
    const snapshot=await client.request({method:"evm_snapshot" as never});
    const draft=await api("admin",`/admin/orders/${deal.offer.id}/decision`,"POST",{refundBuyer:true,reason:"Decision on the branch that will be removed"});
    const removedHash=await send("admin","resolveDispute",[deal.offer.signedOffer.orderId,true,draft.data.decisionHash]);await index();
    expect((await api("buyer",`/orders/${deal.offer.id}`)).data.orderStatus).toBe("REFUNDED");
    const oldHeight=await client.getBlockNumber({cacheTime:0});await client.request({method:"evm_revert" as never,params:[snapshot] as never});
    const height=await client.getBlockNumber({cacheTime:0});await mine(Number(oldHeight-height)+4);await index();
    expect((await api("buyer",`/orders/${deal.offer.id}`)).data.orderStatus).toBe("IN_REVIEW");
    const orphan=await service.from("staff_transactions").select("status").eq("tx_hash",removedHash).single();expect(orphan.data?.status).toBe("ORPHANED");
    const history=await service.from("audit_logs").select("action").eq("order_id",deal.offer.id);expect(history.data?.some(r=>r.action==="TRANSACTION_REORGED")).toBe(true);
    const chat=await api("buyer",`/conversations/${deal.conversationId}/messages`);expect(chat.data.messages.some((m:{kind:string;body:string})=>m.kind==="SYSTEM"&&/refunded/i.test(m.body))).toBe(false);
    const replacement=await api("admin",`/admin/orders/${deal.offer.id}/decision`,"POST",{refundBuyer:false,reason:"Canonical replacement decision"});
    const hash=await send("admin","resolveDispute",[deal.offer.signedOffer.orderId,false,replacement.data.decisionHash]);await index();await index();
    expect((await api("buyer",`/orders/${deal.offer.id}`)).data.orderStatus).toBe("RELEASED");
    const events=await service.from("chain_events").select("tx_hash").eq("payload->>orderId",deal.offer.signedOffer.orderId).eq("event_name","DisputeResolved");expect(events.data).toHaveLength(1);expect(events.data?.[0].tx_hash).toBe(hash);
    record("23-reorg",{passed:true,orderId:deal.offer.id,removedHash,canonicalHash:hash});
  });
});
