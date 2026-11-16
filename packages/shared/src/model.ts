import { z } from "zod";

export const roles = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
export const offerStatuses = ["OPEN", "FUNDED", "EXPIRED"] as const;
// The order of these entries matches IEscrow.OrderStatus in Solidity.
export const orderStatuses = ["NONE", "FUNDED", "DELIVERED", "IN_REVIEW", "RELEASED", "REFUNDED"] as const;
export const transactionStatuses = ["AWAITING_SIGNATURE", "SUBMITTED", "CONFIRMING", "SUCCEEDED", "FAILED"] as const;
export const chainIds = { sepolia: 11155111, local: 31337 } as const;
export const offerLifetime = 30 * 60;
export const deliveryWindow = 24 * 60 * 60;
export const receiptWindow = 48 * 60 * 60;
export const requiredConfirmations = 3;
export const feeBps = 500n;

export const walletSchema = z.string().regex(/^0x(?!0{40}$)[0-9a-fA-F]{40}$/).transform((value) => value.toLowerCase() as `0x${string}`);
export const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as `0x${string}`);
export const weiSchema = z.string().regex(/^[1-9][0-9]{0,77}$/).pipe(z.string().refine((value) => BigInt(value) < 2n ** 256n));
export const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);

export const viewerSchema = z.object({
  id: z.uuid(),
  wallet: walletSchema,
  role: z.enum(roles),
});

export const signedOfferSchema = z.object({
  orderId: bytes32Schema,
  listingId: bytes32Schema,
  buyer: walletSchema,
  seller: walletSchema,
  amount: weiSchema,
  expiresAt: z.number().int().positive(),
  agreementHash: bytes32Schema,
  signature: signatureSchema,
});

export const evidenceReceiptSchema = z.object({
  orderId: bytes32Schema,
  submitter: walletSchema,
  stage: z.union([z.literal(0), z.literal(1)]),
  evidenceHash: bytes32Schema,
  signature: signatureSchema,
});

export const decisionSchema = z.object({
  orderId: bytes32Schema,
  refundBuyer: z.boolean(),
  reason: z.string().trim().min(1),
});

export type Viewer = z.infer<typeof viewerSchema>;
export type Role = Viewer["role"];
export type SignedOffer = z.infer<typeof signedOfferSchema>;
export type EvidenceReceipt = z.infer<typeof evidenceReceiptSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type OrderStatus = (typeof orderStatuses)[number];
export type OfferStatus = (typeof offerStatuses)[number];
export type TransactionStatus = (typeof transactionStatuses)[number];

export type ApiErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
export type ApiResult<T> = { data: T } | { error: { code: ApiErrorCode; message: string } };
