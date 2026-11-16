import { describe, expect, it } from "vitest";
import {
  createMockEscrowReader, demoOrder, hashAgreement, hashEvidence, splitPayment, toChainId, weiSchema,
} from "@marketplace/shared";

describe("shared escrow data", () => {
  it("splits wei exactly and rounds the fee down", () => {
    expect(splitPayment("10000000000000000")).toEqual({
      feeWei: "500000000000000", sellerWei: "9500000000000000",
    });
    expect(splitPayment("19")).toEqual({ feeWei: "0", sellerWei: "19" });
    expect(weiSchema.safeParse(String(2n ** 256n)).success).toBe(false);
    expect(weiSchema.safeParse("1.2").success).toBe(false);
  });

  it("normalizes UUID case and keeps evidence order in the digest", () => {
    const id = "6bcdfef3-94ac-4b78-b829-d2c07a933ba9";
    expect(toChainId(id)).toBe(toChainId(id.toUpperCase()));
    expect(hashEvidence([demoOrder.orderId, demoOrder.listingId]))
      .not.toBe(hashEvidence([demoOrder.listingId, demoOrder.orderId]));
  });

  it("commits delivery details to the agreement digest", () => {
    const terms = {
      title: "Warframe Mod", quantity: 1, gameSlug: "warframe", region: "Asia",
      buyerCharacter: "buyer", sellerCharacter: "seller", deliveryMethod: "Trade",
      meetingTime: "2026-11-16T10:00:00Z",
    };
    expect(hashAgreement(terms)).toBe(hashAgreement({ ...terms, meetingTime: "2026-11-16T10:00:00.000Z" }));
    expect(hashAgreement(terms)).not.toBe(hashAgreement({ ...terms, quantity: 2 }));
  });

  it("provides deterministic order data without an RPC", async () => {
    const mock = createMockEscrowReader([demoOrder], true);
    expect(await mock.getOrder(demoOrder.orderId)).toEqual(demoOrder);
    expect(await mock.getOrder(demoOrder.listingId)).toBeNull();
    expect(await mock.isFundingPaused()).toBe(true);
  });
});
