"use client";
import { keccak256 } from "viem";
import type { ApiResult } from "@marketplace/shared";
import { sniffImageType } from "@/lib/evidence/files";

export async function uploadStagedImage(file: File, purpose: "listing" | "evidence" | "chat", scopeId?: string): Promise<string> {
  const limit = (purpose === "chat" ? 3 : 10) * 1024 * 1024;
  if (!file.size || file.size > limit) throw new Error(`Choose an image between 1 byte and ${purpose === "chat" ? 3 : 10} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error("Choose a JPEG, PNG, or WebP image.");
  const response = await fetch("/api/v1/uploads", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, scopeId, contentType, sizeBytes: file.size, fileHash: keccak256(bytes) }) });
  const body: ApiResult<{ ticketId: string; signedUrl: string }> = await response.json();
  if ("error" in body) throw new Error(body.error.message);
  if (!response.ok) throw new Error("Could not prepare the image upload.");
  const uploaded = await fetch(body.data.signedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!uploaded.ok) throw new Error("Could not upload the image. Please try again.");
  return body.data.ticketId;
}
