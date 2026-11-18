import { expect, it } from "vitest";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashAgreement, toChainId } from "@marketplace/shared";
import { createOfferSchema, matchesAgreement, offerTypedData, type Offer } from "../src/lib/offers/model";

it("binds an offer signature to its parties, price, agreement, chain and escrow", async () => {
  const seller = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const id = "20000000-0000-4000-8000-000000000001";
  const listingId = "30000000-0000-4000-8000-000000000001";
  const agreement = {
    title: "Test mod", gameSlug: "warframe", quantity: 1, region: "Asia",
    buyerCharacter: "Buyer", sellerCharacter: "Seller", deliveryMethod: "In-game trade", meetingTime: "2030-01-01T10:00:00.000Z",
  };
  const offer: Offer = {
    id, agreement, chainId: 31337, escrowAddress: "0x1111111111111111111111111111111111111111", status: "OPEN",
    signedOffer: {
      orderId: toChainId(id), listingId: toChainId(listingId), buyer: "0x2222222222222222222222222222222222222222",
      seller: seller.address.toLowerCase() as `0x${string}`, amount: "1000000000000000", expiresAt: 2_000_000_000,
      agreementHash: hashAgreement(agreement), signature: `0x${"0".repeat(130)}`,
    },
  };
  offer.signedOffer.signature = await seller.signTypedData(offerTypedData(offer));
  expect(createOfferSchema.safeParse({ id, agreement, signedOffer: offer.signedOffer }).success).toBe(true);
  expect(matchesAgreement(offer, listingId)).toBe(true);
  expect(matchesAgreement({ ...offer, agreement: { ...agreement, deliveryMethod: "Changed" } }, listingId)).toBe(false);
  expect(await verifyTypedData({ ...offerTypedData(offer), address: seller.address, signature: offer.signedOffer.signature })).toBe(true);
  for (const modified of [
    { ...offer, chainId: 11155111 as const },
    { ...offer, escrowAddress: "0x3333333333333333333333333333333333333333" as const },
    { ...offer, signedOffer: { ...offer.signedOffer, amount: "2000000000000000" } },
    { ...offer, signedOffer: { ...offer.signedOffer, buyer: seller.address } },
  ]) {
    expect(await verifyTypedData({ ...offerTypedData(modified), address: seller.address, signature: offer.signedOffer.signature })).toBe(false);
  }
});
