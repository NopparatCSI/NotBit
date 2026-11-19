import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { keccak256 } from "viem";
vi.mock("server-only", () => ({}));
import { checkDecodedEvidenceFile } from "../src/lib/evidence/validate-image";

it("decodes supported evidence without changing the hashed original bytes", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).toFormat(format).toBuffer();
    const hash = keccak256(bytes);
    expect(await checkDecodedEvidenceFile("Proof", `image/${format}`, bytes)).toEqual({ ok: true, type: `image/${format}` });
    expect(keccak256(bytes)).toBe(hash);
  }
});

it("rejects magic-byte-only, truncated, mislabeled and over-limit evidence", async () => {
  for (const bytes of [new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]), new Uint8Array([0xff,0xd8,0xff,2]), new TextEncoder().encode("RIFF0000WEBP")]) {
    expect((await checkDecodedEvidenceFile("Proof", "", bytes)).ok).toBe(false);
  }
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  expect((await checkDecodedEvidenceFile("Proof", "image/jpeg", bytes)).ok).toBe(false);
  expect((await checkDecodedEvidenceFile("Proof", "image/png", bytes.subarray(0, 20))).ok).toBe(false);
  expect((await checkDecodedEvidenceFile("Proof", "image/png", new Uint8Array(10 * 1024 * 1024 + 1))).ok).toBe(false);
});
