// Pure helpers for evidence uploads. No server or chain imports, so they are unit-testable.

export const maxEvidenceBytes = 10 * 1024 * 1024;
export const maxFilesPerUpload = 6;
// Uploads per user in a rolling window, counted from stored evidence rows.
export const uploadRateLimit = { files: 30, windowMinutes: 10 } as const;

export const evidenceStageNames = ["delivery", "receipt", "dispute"] as const;
export type EvidenceStageName = (typeof evidenceStageNames)[number];
export const dbStage = { delivery: "DELIVERY", receipt: "RECEIPT", dispute: "DISPUTE" } as const;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";
const extensions: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Detect the real format from magic bytes. The browser's declared type is not trusted.
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (sig: number[], offset = 0) => sig.every((value, i) => bytes[offset + i] === value);
  if (bytes.length >= 4 && starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 8 && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function extensionFor(type: ImageType) {
  return extensions[type];
}

export type FileCheck = { ok: true; type: ImageType } | { ok: false; message: string };

export function checkEvidenceFile(name: string, declaredType: string, bytes: Uint8Array): FileCheck {
  if (bytes.length === 0) return { ok: false, message: `${name} is empty.` };
  if (bytes.length > maxEvidenceBytes) return { ok: false, message: `${name} is larger than 10 MB.` };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, message: `${name} is not a JPEG, PNG, or WebP image.` };
  if (declaredType && declaredType !== "application/octet-stream" && declaredType !== type) {
    return { ok: false, message: `${name} does not match its declared file type.` };
  }
  return { ok: true, type };
}

export function parseStage(value: unknown): EvidenceStageName | null {
  return typeof value === "string" && (evidenceStageNames as readonly string[]).includes(value)
    ? (value as EvidenceStageName)
    : null;
}

export type OrderParty = "BUYER" | "SELLER";

export type EvidenceItem = {
  id: string;
  stage: "DELIVERY" | "RECEIPT" | "DISPUTE";
  submittedBy: OrderParty;
  fileHash: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

// Who may add evidence at each stage and which projected order states allow it.
// The contract enforces stage, caller, and deadline again when the receipt is used.
export function uploadRule(stage: EvidenceStageName) {
  switch (stage) {
    case "delivery": return { parties: ["SELLER"] as OrderParty[], statuses: ["FUNDED"], beforeDeadline: true };
    case "receipt": return { parties: ["BUYER"] as OrderParty[], statuses: ["DELIVERED"], beforeDeadline: true };
    case "dispute": return {
      parties: ["BUYER", "SELLER"] as OrderParty[], statuses: ["FUNDED", "DELIVERED", "IN_REVIEW"], beforeDeadline: false,
    };
  }
}