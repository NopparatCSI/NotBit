import { beforeAll,describe,expect,test } from "vitest";
import { keccak256 } from "viem";
import { offerTypedData } from "../../src/lib/offers/model";
import { api,login,sessions,createDeal,fund,evidence,imageBytes,state,service,client,wallet,send,index,record,mine } from "./environment";
import { escrowAbi } from "@marketplace/shared";
beforeAll(async()=>{for(const p of ["buyer","seller","admin","superAdmin","outsider"] as const)await login(p);});
describe.sequential("22 actual files, expiry, quotas and competing transactions",()=>{
  test("invalid bytes, excessive file size and ticket misuse are rejected",async()=>{
    const deal=await createDeal("bad-files");await fund(deal);
    const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0]);
    const form=new FormData();form.set("stage","delivery");form.append("files",new Blob([bytes],{type:"image/png"}),"truncated.png");
    const bad=await fetch(`${state.appUrl}/api/v1/orders/${deal.offer.id}/evidence`,{method:"POST",headers:{Cookie:sessions.seller.cookie()},body:form});expect(bad.status).toBe(400);
    expect((await api("seller","/uploads","POST",{purpose:"evidence",scopeId:deal.offer.id,contentType:"image/png",sizeBytes:10*1024*1024+1,fileHash:keccak256(bytes)})).status).toBe(400);
    const real=await imageBytes();
    const ticket=await api("seller","/uploads","POST",{purpose:"evidence",scopeId:deal.offer.id,contentType:"image/png",sizeBytes:real.length,fileHash:keccak256(real)});expect(ticket.status).toBe(201);
    const uploaded=await fetch(ticket.data.signedUrl,{method:"PUT",headers:{"Content-Type":"image/png"},body:real});expect(uploaded.ok).toBe(true);
    expect((await api("buyer",`/orders/${deal.offer.id}/evidence`,"POST",{stage:"delivery",ticketIds:[ticket.data.ticketId]})).status).toBe(403);
    expect((await api("seller",`/conversations/${deal.conversationId}/messages`,"POST",{id:crypto.randomUUID(),body:"Wrong-purpose ticket",imageTicketId:ticket.data.ticketId})).status).toBe(400);
    await service.from("upload_tickets").update({expires_at:new Date(Date.now()-1000).toISOString()}).eq("id",ticket.data.ticketId);
    expect((await api("seller",`/orders/${deal.offer.id}/evidence`,"POST",{stage:"delivery",ticketIds:[ticket.data.ticketId]})).status).toBe(400);
    const rows=await service.from("evidence").select("id").eq("order_id",deal.offer.id);expect(rows.data).toHaveLength(0);
    record("22-files",{passed:true,orderId:deal.offer.id});
  });
  test("signed evidence URL expires after 60 seconds",async()=>{
    const deal=await createDeal("signed-expiry");await fund(deal);const saved=await evidence("seller",deal,"delivery");
    const link=await api("buyer",`/orders/${deal.offer.id}/evidence/${saved.evidence[0].id}`);expect((await fetch(link.data.url)).status).toBe(200);
    // Keep each wait below 60 seconds. The token is checked by actual Storage, not mocked time.
    await new Promise(resolve=>setTimeout(resolve,35_000));
    await new Promise(resolve=>setTimeout(resolve,30_000));
    expect((await fetch(link.data.url)).ok).toBe(false);
    const fresh=await api("buyer",`/orders/${deal.offer.id}/evidence/${saved.evidence[0].id}`);expect((await fetch(fresh.data.url)).ok).toBe(true);
    record("22-expiry",{passed:true,seconds:65});
  });
  test("concurrent quota reservations and upload tickets cannot exceed 30",async()=>{
    // Remove only this isolated outsider fixture's previous unused reservations.
    await service.from("evidence_upload_reservations").delete().eq("user_id",sessions.outsider.id);
    await service.from("upload_tickets").delete().eq("user_id",sessions.outsider.id);
    const reservations=await Promise.all(Array.from({length:6},()=>service.rpc("reserve_evidence_quota",{p_user:sessions.outsider.id,p_count:6})));
    expect(reservations.filter(r=>!r.error)).toHaveLength(5);expect(reservations.filter(r=>r.error?.code==="P0001")).toHaveLength(1);
    const bytes=await imageBytes();
    const tickets=await Promise.all(Array.from({length:32},()=>api("outsider","/uploads","POST",{purpose:"listing",contentType:"image/png",sizeBytes:bytes.length,fileHash:keccak256(bytes)})));
    expect(tickets.filter(r=>r.status===201)).toHaveLength(30);expect(tickets.filter(r=>r.status===429)).toHaveLength(2);
    record("22-quota",{passed:true,reservedFiles:30,tickets:30});
  });
  test("two funding transactions and competing staff decisions settle only once",async()=>{
    const deal=await createDeal("parallel");
    const args=[offerTypedData(deal.offer).message,deal.offer.signedOffer.signature] as const;
    // Bypass preflight only here so both competing requests reach the real Contract.
    const nonce=await client.getTransactionCount({address:state.roles.buyer});
    await client.request({method:"evm_setIntervalMining" as never,params:[0] as never});
    await client.request({method:"evm_setAutomine" as never,params:[false] as never});
    let one:`0x${string}`,two:`0x${string}`;
    try{
    one=await wallet("buyer").writeContract({address:state.escrowAddress,abi:escrowAbi,functionName:"fundOrder",args,value:BigInt(deal.offer.signedOffer.amount),nonce,gas:500000n});
    two=await wallet("buyer").writeContract({address:state.escrowAddress,abi:escrowAbi,functionName:"fundOrder",args,value:BigInt(deal.offer.signedOffer.amount),nonce:nonce+1,gas:500000n});
    await mine(1);
    }finally{await client.request({method:"evm_setAutomine" as never,params:[true] as never});await client.request({method:"evm_setIntervalMining" as never,params:[1000] as never});}
    const receipts=await Promise.all([one,two].map(hash=>client.waitForTransactionReceipt({hash})));expect(receipts.map(r=>r.status).sort()).toEqual(["reverted","success"]);
    await index();await send("buyer","openDispute",[deal.offer.signedOffer.orderId]);await index();
    const drafts=await Promise.all([api("admin",`/admin/orders/${deal.offer.id}/decision`,"POST",{refundBuyer:true,reason:"Concurrent refund"}),api("superAdmin",`/admin/orders/${deal.offer.id}/decision`,"POST",{refundBuyer:false,reason:"Concurrent release"})]);
    expect(drafts.map(r=>r.status)).toEqual([201,201]);
    await client.request({method:"evm_setIntervalMining" as never,params:[0] as never});await client.request({method:"evm_setAutomine" as never,params:[false] as never});
    let hashes:`0x${string}`[];
    try{hashes=await Promise.all([wallet("admin").writeContract({address:state.escrowAddress,abi:escrowAbi,functionName:"resolveDispute",args:[deal.offer.signedOffer.orderId,true,drafts[0].data.decisionHash],gas:500000n}),wallet("superAdmin").writeContract({address:state.escrowAddress,abi:escrowAbi,functionName:"resolveDispute",args:[deal.offer.signedOffer.orderId,false,drafts[1].data.decisionHash],gas:500000n})]);await mine(1);}
    finally{await client.request({method:"evm_setAutomine" as never,params:[true] as never});await client.request({method:"evm_setIntervalMining" as never,params:[1000] as never});}
    const decisions=await Promise.all(hashes.map(hash=>client.waitForTransactionReceipt({hash})));expect(decisions.map(r=>r.status).sort()).toEqual(["reverted","success"]);await index();
    const events=await service.from("chain_events").select("event_name").eq("payload->>orderId",deal.offer.signedOffer.orderId).in("event_name",["OrderReleased","OrderRefunded"]);expect(events.data).toHaveLength(1);
    record("22-concurrency",{passed:true,orderId:deal.offer.id,fundingHashes:[one,two],decisionHashes:hashes});
  });
});
