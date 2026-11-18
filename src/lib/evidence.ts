import { evidenceReceiptSchema, hashEvidence } from "@marketplace/shared";
import { keccak256, type Hex } from "viem";
import { z } from "zod";

export const evidenceReceiptResponseSchema = evidenceReceiptSchema.extend({
  signature: evidenceReceiptSchema.shape.signature.transform((value) => value as Hex),
});
export type SignedEvidenceReceipt = z.infer<typeof evidenceReceiptResponseSchema>;
export const evidenceRecordsSchema = z.array(z.object({
  id: z.uuid(),
  stage: z.enum(["DELIVERY", "RECEIPT", "DISPUTE"]),
  submittedBy: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive(),
  fileHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}));
export type EvidenceRecord = z.infer<typeof evidenceRecordsSchema>[number];

export function evidenceContentType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function hashEvidenceFiles(files: readonly File[]) {
  if (files.length === 0) throw new Error("Attach at least one evidence image.");
  const hashes: Hex[] = [];
  for (const file of files) {
    if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("Each evidence image must be between 1 byte and 10 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!evidenceContentType(bytes)) throw new Error("Evidence must be a JPEG, PNG, or WebP image.");
    hashes.push(keccak256(bytes));
  }
  return hashEvidence(hashes);
}

export function checkEvidenceReceipt(receipt: SignedEvidenceReceipt, expected: {
  orderId: Hex; submitter: Hex; stage: 0 | 1; evidenceHash: Hex;
}) {
  if (receipt.orderId !== expected.orderId || receipt.submitter !== expected.submitter.toLowerCase() ||
      receipt.stage !== expected.stage || receipt.evidenceHash !== expected.evidenceHash) {
    throw new Error("The evidence receipt does not match this order, wallet, action, or selected images.");
  }
}
