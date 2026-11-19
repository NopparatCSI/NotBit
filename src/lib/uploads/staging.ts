import "server-only";
import { keccak256 } from "viem";
import { z } from "zod";
import { ApiError } from "@/lib/api/response";
import { requireService } from "@/lib/orders/context";

export const uploadTicketSchema = z.object({
  purpose: z.enum(["listing", "evidence", "chat"]), scopeId: z.uuid().optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024), fileHash: z.string().regex(/^0x[0-9a-f]{64}$/),
}).refine(v => v.purpose === "listing" || !!v.scopeId, { message: "An order or conversation is required." })
  .refine(v => v.purpose !== "chat" || v.sizeBytes <= 3 * 1024 * 1024, { message: "Chat images must be at most 3 MB." });
export type UploadPurpose = z.infer<typeof uploadTicketSchema>["purpose"];

export async function takeStagedImage(id: string, userId: string, purpose: UploadPurpose, scopeId?: string): Promise<File> {
  if (!z.uuid().safeParse(id).success) throw new ApiError(400, "INVALID_INPUT", "Invalid upload ticket.");
  const db = requireService();
  const { data, error } = await db.from("upload_tickets").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(503, "UNAVAILABLE", "Could not check the uploaded image.");
  if (!data || data.purpose !== purpose || data.scope_id !== (scopeId ?? null) || data.consumed_at || Date.parse(data.expires_at) <= Date.now()) {
    throw new ApiError(400, "INVALID_INPUT", "The upload ticket is unavailable. Upload the image again.");
  }
  const stored = await db.storage.from("upload-staging").download(data.object_path);
  if (stored.error || !stored.data) throw new ApiError(503, "UNAVAILABLE", "The image has not finished uploading. Try again.");
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  if (bytes.length !== data.size_bytes || keccak256(bytes) !== data.file_hash) throw new ApiError(400, "INVALID_INPUT", "The uploaded image does not match its size or hash.");
  const claimed = await db.from("upload_tickets").update({ consumed_at: new Date().toISOString() }).eq("id", id).is("consumed_at", null).select("id");
  if (claimed.error) throw new ApiError(503, "UNAVAILABLE", "Could not finalize the image upload.");
  if (claimed.data?.length !== 1) throw new ApiError(409, "CONFLICT", "This upload was already used. Upload the image again.");
  // Keep staging objects until signed upload tokens expire (2 hours); no overwrite or reuse.
  return new File([bytes], "Uploaded image", { type: data.content_type });
}

export async function cleanupStagedImages() {
  const db = requireService();
  await db.from("evidence_upload_reservations").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("upload_tickets").select("id,object_path").lt("expires_at", cutoff).limit(20);
  if (error || !data?.length) return;
  const removed = await db.storage.from("upload-staging").remove(data.map(row => row.object_path));
  if (!removed.error) await db.from("upload_tickets").delete().in("id", data.map(row => row.id));
}
