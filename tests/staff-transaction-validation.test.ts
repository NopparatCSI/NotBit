import { beforeEach, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import { demoViewers, escrowAbi } from "@marketplace/shared";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({transaction:vi.fn(),order:vi.fn(),upsert:vi.fn(),service:vi.fn()}));
const escrow="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",chainOrder=`0x${"1".repeat(64)}` as const,hash=`0x${"2".repeat(64)}` as const;
vi.mock("@/lib/chain/config",()=>({getEscrowConfig:()=>({chainId:31337,escrowAddress:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}),getCheckedEscrowClient:async()=>({getTransaction:m.transaction})}));
vi.mock("@/lib/orders/context",()=>({loadOrder:m.order,requireService:m.service}));
import { recordStaffTransaction } from "../src/lib/admin/transactions";
beforeEach(()=>{
 vi.clearAllMocks();m.order.mockResolvedValue({id:"order",chain_id:31337,escrow_address:escrow,chain_order_id:chainOrder});
 m.transaction.mockResolvedValue({from:demoViewers.admin.wallet,to:escrow,input:encodeFunctionData({abi:escrowAbi,functionName:"escalateExpiredOrder",args:[chainOrder]})});
 m.upsert.mockResolvedValue({error:null});m.service.mockReturnValue({from:(table:string)=>({upsert:(data:unknown,options:unknown)=>m.upsert(table,data,options)})});
});
const input={action:"ESCALATION_SUBMITTED",orderId:"order",txHash:hash};
it("rejects staff hashes from another wallet or escrow before writing history",async()=>{
 m.transaction.mockResolvedValue({from:demoViewers.buyer.wallet,to:escrow,input:"0x"});
 await expect(recordStaffTransaction(demoViewers.admin,input)).rejects.toThrow("does not belong");expect(m.upsert).not.toHaveBeenCalled();
 m.transaction.mockResolvedValue({from:demoViewers.admin.wallet,to:demoViewers.buyer.wallet,input:"0x"});
 await expect(recordStaffTransaction(demoViewers.admin,input)).rejects.toThrow("does not belong");expect(m.upsert).not.toHaveBeenCalled();
});
it("rejects a transaction for another order action",async()=>{
 m.transaction.mockResolvedValue({from:demoViewers.admin.wallet,to:escrow,input:encodeFunctionData({abi:escrowAbi,functionName:"withdrawPendingPayout"})});
 await expect(recordStaffTransaction(demoViewers.admin,input)).rejects.toThrow("does not match");expect(m.upsert).not.toHaveBeenCalled();
});
it("retries the same durable transaction and audit key after the history write fails",async()=>{
 let first=true;m.upsert.mockImplementation(async(table:string)=>{if(table==="audit_logs"&&first){first=false;return{error:{code:"offline"}}}return{error:null}});
 await expect(recordStaffTransaction(demoViewers.admin,input)).rejects.toThrow("activity entry will be retried");
 await recordStaffTransaction(demoViewers.admin,input);
 const audits=m.upsert.mock.calls.filter(c=>c[0]==="audit_logs");
 expect(audits).toHaveLength(2);expect(audits[0][1].dedupe_key).toBe(audits[1][1].dedupe_key);
 expect(audits[1][2]).toEqual({onConflict:"dedupe_key",ignoreDuplicates:true});
});
