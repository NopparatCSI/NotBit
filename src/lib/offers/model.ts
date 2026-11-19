import { agreementSchema, escrowDomain, hashAgreement, offerTypes, signedOfferSchema, toChainId, weiSchema } from "@marketplace/shared";
import { z } from "zod";
import type { Address, Hex } from "viem";

export const offerAgreementSchema = agreementSchema.extend({
  title: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(2_147_483_647),
  gameSlug: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(80),
  buyerCharacter: z.string().trim().min(1).max(80),
  sellerCharacter: z.string().trim().min(1).max(80),
  deliveryMethod: z.string().trim().min(1).max(240),
});
export const createOfferSchema = z.strictObject({
  id: z.uuid(),
  agreement: offerAgreementSchema,
  signedOffer: signedOfferSchema.extend({ signature: signedOfferSchema.shape.signature.transform((value) => value as Hex) }),
});
export const fundingSchema = z.strictObject({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });
export type Agreement = z.infer<typeof offerAgreementSchema>;
export type Offer = z.infer<typeof createOfferSchema> & {
  chainId: 11155111 | 31337;
  escrowAddress: Address;
  status: "OPEN" | "FUNDED" | "EXPIRED";
};
export type OfferContext = {
  buyer: Address;
  seller: Address;
  chainId: 11155111 | 31337;
  escrowAddress: Address;
};
export type OrderFunding = {
  status: "AWAITING_DEPOSIT" | "SUBMITTED" | "CONFIRMING" | "CONFIRMED" | "FAILED";
  confirmations: number;
  hash: `0x${string}` | null;
  orderStatus: string | null;
  deadline: number | null;
  projectionReady?: boolean;
};

export function offerTypedData(offer: Pick<Offer, "signedOffer" | "chainId" | "escrowAddress">) {
  const { signature: _signature, ...fields } = offer.signedOffer;
  return {
    domain: escrowDomain(offer.chainId, offer.escrowAddress),
    types: offerTypes,
    primaryType: "Offer" as const,
    message: { ...fields, amount: BigInt(weiSchema.parse(fields.amount)), expiresAt: BigInt(fields.expiresAt) },
  };
}

export function matchesAgreement(offer: Pick<Offer, "id" | "agreement" | "signedOffer">, listingId: string) {
  return offer.signedOffer.orderId === toChainId(offer.id) &&
    offer.signedOffer.listingId === toChainId(listingId) &&
    offer.signedOffer.agreementHash === hashAgreement(offer.agreement);
}
