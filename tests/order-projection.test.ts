import { expect, it } from "vitest";
import { projectionMatches } from "../src/lib/orders/projection";
it("keeps evidence unavailable until the canonical order matches the confirmed chain state", () => {
  const chain = { status: "DELIVERED", orderId: "0x123", deadline: 1_800_000_000 };
  const row = { on_chain: true, status: chain.status, chain_order_id: chain.orderId, deadline: new Date(chain.deadline * 1000).toISOString() };
  expect(projectionMatches(null, chain)).toBe(false);
  expect(projectionMatches({ ...row, status: "FUNDED" }, chain)).toBe(false);
  expect(projectionMatches({ ...row, on_chain: false }, chain)).toBe(false);
  expect(projectionMatches({ ...row, deadline: new Date(0).toISOString() }, chain)).toBe(false);
  expect(projectionMatches(row, chain)).toBe(true);
});
