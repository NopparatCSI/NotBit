import { beforeAll, describe, expect, test } from "vitest";
import { api, login, createDeal, fund, send, index, chainOrder, client, state, service, record } from "./environment";
beforeAll(async () => { for (const p of ["buyer", "seller", "admin", "superAdmin"] as const) await login(p); });
describe.sequential("18 dispute decisions return to both traders", () => {
  for (const refundBuyer of [true, false]) test(refundBuyer ? "Admin refunds buyer" : "Super Admin releases 95/5", async () => {
    const deal = await createDeal(refundBuyer ? "refund" : "staff-release");
    await fund(deal);
    expect((await api("buyer", `/orders/${deal.offer.id}/dispute`, "POST", { reason: "Acceptance dispute: delivery terms not met" })).status).toBe(201);
    await send("buyer", "openDispute", [deal.offer.signedOffer.orderId]);
    await index();
    const staff = refundBuyer ? "admin" : "superAdmin";
    const prepared = await api(staff, `/admin/orders/${deal.offer.id}/decision`, "POST", { refundBuyer, reason: refundBuyer ? "Verified no delivery; refund in full." : "Verified delivered as agreed; release payment." });
    expect(prepared.status).toBe(201);
    const balanceBefore = await client.getBalance({ address: refundBuyer ? state.roles.buyer : state.roles.seller });
    const hash = await send(staff, "resolveDispute", [deal.offer.signedOffer.orderId, refundBuyer, prepared.data.decisionHash]);
    expect((await api(staff, "/admin/activity", "POST", { action: "DECISION_SUBMITTED", orderId: deal.offer.id, txHash: hash })).status).toBe(201);
    await index();
    expect((await chainOrder(deal)).status).toBe(refundBuyer ? 5 : 4);
    const amount = BigInt(deal.offer.signedOffer.amount);
    expect(await client.getBalance({ address: refundBuyer ? state.roles.buyer : state.roles.seller }) - balanceBefore).toBe(refundBuyer ? amount : amount * 95n / 100n);
    for (const person of ["buyer", "seller"] as const) {
      expect((await api(person, `/orders/${deal.offer.id}`)).data).toMatchObject({ orderStatus: refundBuyer ? "REFUNDED" : "RELEASED", projectionReady: true });
      const chat = await api(person, `/conversations/${deal.conversationId}/messages`);
      expect(chat.data.messages.some((m: {kind:string;body:string}) => m.kind === "SYSTEM" && new RegExp(refundBuyer ? "refunded" : "released", "i").test(m.body))).toBe(true);
    }
    const dispute = await service.from("disputes").select("decision_reason,decision_hash,refund_buyer").eq("order_id", deal.offer.id).single();
    expect(dispute.data).toMatchObject({ decision_hash: prepared.data.decisionHash, refund_buyer: refundBuyer });
    expect(dispute.data?.decision_reason).not.toContain("not recorded");
    expect((await api(staff, `/admin/orders/${deal.offer.id}/decision`, "POST", { refundBuyer, reason: "Repeat" })).status).toBe(409);
    record("18", { passed: true, refundBuyer, orderId: deal.offer.id, hash });
  });
});
