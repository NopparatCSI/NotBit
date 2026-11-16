import { encodeAbiParameters, keccak256, parseAbi, stringToHex, type Address, type Hex } from "viem";
import { z } from "zod";
import { bytes32Schema, feeBps, weiSchema, type Decision, type OrderStatus } from "./model";

export const escrowAbi = parseAbi([
  "struct Offer { bytes32 orderId; bytes32 listingId; address buyer; address seller; uint256 amount; uint64 expiresAt; bytes32 agreementHash; }",
  "struct EvidenceReceipt { bytes32 orderId; address submitter; uint8 stage; bytes32 evidenceHash; }",
  "struct Order { bytes32 listingId; address buyer; address seller; uint256 amount; uint64 deadline; uint8 status; bytes32 agreementHash; bytes32 deliveryHash; bytes32 receiptHash; bytes32 decisionHash; }",
  "function fundOrder(Offer offer, bytes sellerSignature) payable",
  "function confirmDelivery(EvidenceReceipt receipt, bytes receiptSignature)",
  "function confirmReceipt(EvidenceReceipt receipt, bytes receiptSignature)",
  "function openDispute(bytes32 orderId)",
  "function escalateExpiredOrder(bytes32 orderId)",
  "function resolveDispute(bytes32 orderId, bool refundBuyer, bytes32 decisionHash)",
  "function withdrawPendingPayout()",
  "function setFundingPaused(bool paused)",
  "function fundingPaused() view returns (bool)",
  "function getOrder(bytes32 orderId) view returns (Order)",
  "function pendingPayouts(address account) view returns (uint256)",
  "function listingFunded(bytes32 listingId) view returns (bool)",
  "function admin() view returns (address)",
  "function superAdmin() view returns (address)",
  "event OrderFunded(bytes32 indexed orderId, bytes32 indexed listingId, address indexed buyer, address seller, uint256 amount, uint64 deadline, bytes32 agreementHash)",
  "event DeliveryConfirmed(bytes32 indexed orderId, uint64 deadline, bytes32 evidenceHash)",
  "event ReceiptConfirmed(bytes32 indexed orderId, bytes32 evidenceHash)",
  "event OrderInReview(bytes32 indexed orderId, address indexed actor, bool expired)",
  "event DisputeResolved(bytes32 indexed orderId, address indexed resolver, bool refundBuyer, bytes32 decisionHash)",
  "event OrderReleased(bytes32 indexed orderId, uint256 sellerAmount, uint256 fee)",
  "event OrderRefunded(bytes32 indexed orderId, uint256 amount)",
  "event PayoutQueued(address indexed recipient, uint256 amount)",
  "event PayoutWithdrawn(address indexed recipient, uint256 amount)",
  "event FundingPauseChanged(bool paused)",
  "error Unauthorized()",
  "error InvalidOrderState()",
  "error InvalidOffer()",
  "error InvalidSignature()",
  "error InvalidReceipt()",
  "error IncorrectAmount()",
  "error FundingPaused()",
  "error ListingAlreadyFunded()",
  "error DeadlinePassed()",
  "error DeadlineNotPassed()",
  "error InvalidDecision()",
  "error InvalidConfiguration()",
  "error NoPendingPayout()",
  "error PayoutFailed()",
]);

export function escrowDomain(chainId: number, verifyingContract: Address) {
  return { name: "Game Item Marketplace Escrow", version: "1", chainId, verifyingContract } as const;
}

export const offerTypes = {
  Offer: [
    { name: "orderId", type: "bytes32" },
    { name: "listingId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
    { name: "agreementHash", type: "bytes32" },
  ],
} as const;

export const evidenceReceiptTypes = {
  EvidenceReceipt: [
    { name: "orderId", type: "bytes32" },
    { name: "submitter", type: "address" },
    { name: "stage", type: "uint8" },
    { name: "evidenceHash", type: "bytes32" },
  ],
} as const;

export const evidenceStages = { delivery: 0, receipt: 1 } as const;

export function toChainId(id: string) {
  return keccak256(stringToHex(z.uuid().parse(id).toLowerCase()));
}

export function splitPayment(amountWei: string) {
  const amount = BigInt(weiSchema.parse(amountWei));
  const fee = (amount * feeBps) / 10_000n;
  return { feeWei: fee.toString(), sellerWei: (amount - fee).toString() };
}

export const agreementSchema = z.object({
  title: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  gameSlug: z.string().trim().min(1),
  region: z.string().trim().min(1),
  buyerCharacter: z.string().trim().min(1),
  sellerCharacter: z.string().trim().min(1),
  deliveryMethod: z.string().trim().min(1),
  meetingTime: z.iso.datetime(),
});

export function hashAgreement(input: z.input<typeof agreementSchema>) {
  const terms = agreementSchema.parse(input);
  return keccak256(encodeAbiParameters(
    [{ type: "uint8" }, { type: "string" }, { type: "uint256" }, { type: "string" }, { type: "string" },
      { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }],
    [1, terms.title, BigInt(terms.quantity), terms.gameSlug, terms.region, terms.buyerCharacter,
      terms.sellerCharacter, terms.deliveryMethod, new Date(terms.meetingTime).toISOString()],
  ));
}

export function hashEvidence(files: readonly Hex[]) {
  const hashes = z.array(bytes32Schema).min(1).parse(files);
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [hashes]));
}

export function hashDecision({ orderId, refundBuyer, reason }: Decision) {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bool" }, { type: "string" }],
    [bytes32Schema.parse(orderId), refundBuyer, z.string().trim().min(1).parse(reason)],
  ));
}

export type OrderSnapshot = {
  orderId: Hex;
  listingId: Hex;
  buyer: Address;
  seller: Address;
  amountWei: string;
  deadline: number;
  status: Exclude<OrderStatus, "NONE">;
};

export interface EscrowReader {
  getOrder(orderId: Hex): Promise<OrderSnapshot | null>;
  isFundingPaused(): Promise<boolean>;
}
