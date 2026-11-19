import { beforeAll, expect, test } from "vitest";
import { escrowAbi } from "@marketplace/shared";
import { api, login, createDeal, fund, evidence, confirm, send, client, state, index, record } from "./environment";
import { offerTypedData } from "../../src/lib/offers/model";
beforeAll(async () => { for (const p of ["buyer","seller","admin","superAdmin"] as const) await login(p); });
test("20 queued payout is paid once; pause preserves existing trades and withdrawals", async () => {
  const queued = await createDeal("queued-refund"); await fund(queued);
  await send("buyer","openDispute",[queued.offer.signedOffer.orderId]); await index();
  const draft = await api("admin",`/admin/orders/${queued.offer.id}/decision`,"POST",{refundBuyer:true,reason:"Acceptance transfer rejection"});
  // Fault injection changes only the local recipient's receive behavior, never escrow code.
  await client.request({method:"hardhat_setCode" as never,params:[state.roles.buyer,"0x60006000fd"] as never});
  try { await send("admin","resolveDispute",[queued.offer.signedOffer.orderId,true,draft.data.decisionHash]); }
  finally { await client.request({method:"hardhat_setCode" as never,params:[state.roles.buyer,"0x"] as never}); }
  await index();
  expect((await api("buyer","/payout")).data.pendingWei).toBe(queued.offer.signedOffer.amount);
  const existing = await createDeal("existing-during-pause"); await fund(existing);
  const blocked = await createDeal("blocked-during-pause");
  await send("superAdmin","setFundingPaused",[true]);
  try {
    await expect(client.simulateContract({account:state.roles.buyer,address:state.escrowAddress,abi:escrowAbi,functionName:"fundOrder",args:[offerTypedData(blocked.offer).message,blocked.offer.signedOffer.signature],value:BigInt(blocked.offer.signedOffer.amount)})).rejects.toThrow();
    const delivery=await evidence("seller",existing,"delivery");await confirm("seller",delivery.receipt);await index();
    const receipt=await evidence("buyer",existing,"receipt");await confirm("buyer",receipt.receipt);await index();
    const before=await client.getBalance({address:state.roles.buyer});
    const hash=await send("buyer","withdrawPendingPayout",[]);const tx=await client.getTransactionReceipt({hash});await index();
    expect(await client.getBalance({address:state.roles.buyer})-before+tx.gasUsed*tx.effectiveGasPrice).toBe(BigInt(queued.offer.signedOffer.amount));
    expect((await api("buyer","/payout")).data.pendingWei).toBe("0");
    await expect(client.simulateContract({account:state.roles.buyer,address:state.escrowAddress,abi:escrowAbi,functionName:"withdrawPendingPayout"})).rejects.toThrow();
    record("20",{passed:true,orderId:queued.offer.id,withdrawalHash:hash});
  } finally { await send("superAdmin","setFundingPaused",[false]);await index(); }
});
