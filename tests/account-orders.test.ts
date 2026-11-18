import { expect, it } from "vitest";
import { ordersPage, orderStatusLabel, type AccountOrder } from "../src/lib/orders/model";
import type { OrderFunding } from "../src/lib/offers/model";

const order: AccountOrder = {
  id: "20000000-0000-4000-8000-000000000001", conversationId: "40000000-0000-4000-8000-000000000001",
  amountWei: "1000000000000000", agreement: null,
  createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T00:30:00Z",
};
const now = new Date("2026-01-01T01:00:00Z").getTime();
const state: OrderFunding = { status: "CONFIRMED", confirmations: 3, hash: null, orderStatus: "FUNDED", deadline: now / 1000 + 3600 };

it("uses confirmed chain state ahead of an expired offer and preserves the buyer/seller action", () => {
  expect(orderStatusLabel(order, state, "buy", now)).toBe("Awaiting delivery");
  expect(orderStatusLabel(order, state, "sell", now)).toBe("To deliver");
  expect(orderStatusLabel(order, { ...state, orderStatus: "DELIVERED" }, "buy", now)).toBe("Confirm receipt");
  expect(orderStatusLabel(order, { ...state, orderStatus: "DELIVERED" }, "sell", now)).toBe("Awaiting buyer receipt");
  expect(orderStatusLabel(order, { ...state, deadline: now / 1000 }, "buy", now)).toBe("Requires admin review");
  expect(orderStatusLabel(order, { ...state, orderStatus: "IN_REVIEW", deadline: now / 1000 - 1 }, "buy", now)).toBe("Under review");
  expect(orderStatusLabel(order, { ...state, orderStatus: "RELEASED", deadline: now / 1000 - 1 }, "sell", now)).toBe("Completed");
  expect(orderStatusLabel(order, { ...state, orderStatus: "REFUNDED" }, "buy", now)).toBe("Refunded");
});

it("keeps unverified and pending deposits distinct from expired unfunded offers", () => {
  expect(orderStatusLabel(order, null, "buy", now)).toBe("Checking status");
  expect(orderStatusLabel(order, { ...state, status: "SUBMITTED", orderStatus: null }, "buy", now)).toBe("Confirming deposit");
  expect(orderStatusLabel(order, { ...state, status: "AWAITING_DEPOSIT", orderStatus: null }, "buy", now)).toBe("Offer expired");
  expect(orderStatusLabel(order, { ...state, status: "FAILED", orderStatus: null }, "sell", now)).toBe("Deposit failed");
});

it("normalizes invalid pagination inputs without unsafe offsets", () => {
  for (const value of [undefined, ["2"], "-1", "0", "1.5", "1e3", "99999999999999999999"]) expect(ordersPage(value)).toBe(1);
  expect(ordersPage("2")).toBe(2);
});
