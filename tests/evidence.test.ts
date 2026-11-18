import { expect, it } from "vitest";
import { hashEvidence } from "@marketplace/shared";
import { keccak256 } from "viem";
import { checkEvidenceReceipt, evidenceContentType, hashEvidenceFiles, type SignedEvidenceReceipt } from "../src/lib/evidence";

it("hashes the uploaded image bytes in order and rejects unsupported or oversized evidence", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 2]);
  expect(evidenceContentType(png)).toBe("image/png");
  expect(evidenceContentType(jpeg)).toBe("image/jpeg");
  expect(evidenceContentType(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
  expect(evidenceContentType(new TextEncoder().encode("not an image"))).toBeNull();
  const files = [new File([png], "first.png"), new File([jpeg], "second.jpg")];
  expect(await hashEvidenceFiles(files)).toBe(hashEvidence([keccak256(png), keccak256(jpeg)]));
  await expect(hashEvidenceFiles([])).rejects.toThrow("at least one");
  await expect(hashEvidenceFiles([new File(["not an image"], "fake.png", { type: "image/png" })])).rejects.toThrow("JPEG, PNG, or WebP");
  await expect(hashEvidenceFiles([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png")])).rejects.toThrow("10 MB");
});

it("rejects evidence receipts for a different order, wallet, stage or image hash", () => {
  const receipt: SignedEvidenceReceipt = {
    orderId: `0x${"1".repeat(64)}`, submitter: `0x${"2".repeat(40)}`,
    stage: 0, evidenceHash: `0x${"3".repeat(64)}`, signature: `0x${"4".repeat(130)}`,
  };
  const expected = { orderId: receipt.orderId, submitter: receipt.submitter, stage: 0 as const, evidenceHash: receipt.evidenceHash };
  expect(() => checkEvidenceReceipt(receipt, expected)).not.toThrow();
  for (const altered of [
    { ...receipt, stage: 1 as const },
    { ...receipt, orderId: `0x${"5".repeat(64)}` as const },
    { ...receipt, submitter: `0x${"6".repeat(40)}` as const },
    { ...receipt, evidenceHash: `0x${"7".repeat(64)}` as const },
  ]) expect(() => checkEvidenceReceipt(altered, expected)).toThrow("does not match");
});
