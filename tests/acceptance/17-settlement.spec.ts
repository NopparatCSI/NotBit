import { beforeAll, expect, test } from "vitest";
import { api, login, createDeal, fund, evidence, confirm, index, client, state, chainOrder, record } from "./environment";

beforeAll(async () => { await login("buyer"); await login("seller"); });
test("17 real API, Storage, signer, Contract and indexer settle exactly 95/5", async () => {
  const deal = await createDeal("happy-path");
  const message = await api("buyer", `/conversations/${deal.conversationId}/messages`, "POST", { body: "Ready for the acceptance trade" });
  expect(message.status).toBe(201);
  const sellerBefore = await client.getBalance({ address: state.roles.seller });
  const treasuryBefore = await client.getBalance({ address: state.roles.treasury });
  await fund(deal);
  expect((await api("buyer", `/orders/${deal.offer.id}`)).data).toMatchObject({ status: "CONFIRMED", projectionReady: true, orderStatus: "FUNDED" });
  const delivery = await evidence("seller", deal, "delivery");
  const deliveryHash = await confirm("seller", delivery.receipt);
  const deliveryTx = await client.getTransactionReceipt({ hash: deliveryHash });
  await index();
  expect((await api("buyer", `/orders/${deal.offer.id}`)).data.orderStatus).toBe("DELIVERED");
  const received = await evidence("buyer", deal, "receipt");
  await confirm("buyer", received.receipt);
  await index();
  expect((await chainOrder(deal)).status).toBe(4);
  const amount = BigInt(deal.offer.signedOffer.amount), fee = amount * 500n / 10_000n;
  expect(await client.getBalance({ address: state.roles.treasury }) - treasuryBefore).toBe(fee);
  expect(await client.getBalance({ address: state.roles.seller }) - sellerBefore + deliveryTx.gasUsed * deliveryTx.effectiveGasPrice).toBe(amount - fee);
  for (const person of ["buyer", "seller"] as const) expect((await api(person, `/orders/${deal.offer.id}`)).data).toMatchObject({ orderStatus: "RELEASED", projectionReady: true });
  const messages = await api("buyer", `/conversations/${deal.conversationId}/messages`);
  expect(messages.data.messages.some((m: {kind: string; body: string}) => m.kind === "SYSTEM" && /released/i.test(m.body))).toBe(true);
  record("17-api", { passed: true, orderId: deal.offer.id, sellerWei: String(amount-fee), feeWei: String(fee) });
});
