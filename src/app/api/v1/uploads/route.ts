import { readJson } from "@/lib/api/body";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireTradeUser } from "@/lib/auth/viewer";
import { loadOrder, partyOf, requireService } from "@/lib/orders/context";
import { requireConversation } from "@/lib/trade/server";
import { uploadTicketSchema } from "@/lib/uploads/staging";

export function POST(request: Request) {
  return handle(async () => {
    const viewer = await requireTradeUser();
    const input = await readJson(request, uploadTicketSchema);
    const db = requireService();
    if (input.purpose === "evidence") {
      if (!partyOf(viewer, await loadOrder(input.scopeId!))) throw new ApiError(404, "NOT_FOUND", "Order not found.");
    } else if (input.purpose === "chat") {
      // Do not turn authorization failures into an unhandled internal error.
      const room = await requireConversation(input.scopeId!, viewer.id).catch(() => null);
      if (!room) throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
    } else if (input.scopeId) {
      const listing = await db.from("listings").select("id").eq("id", input.scopeId).eq("seller_id", viewer.id).in("status", ["ACTIVE", "PAUSED"]).maybeSingle();
      if (listing.error) throw new ApiError(503, "UNAVAILABLE", "Could not check the listing.");
      if (!listing.data) throw new ApiError(404, "NOT_FOUND", "Editable listing not found.");
    }
    const reserved = await db.rpc("reserve_upload_ticket", { p_user: viewer.id, p_purpose: input.purpose, p_scope: input.scopeId ?? null, p_type: input.contentType, p_bytes: input.sizeBytes, p_hash: input.fileHash }).single().returns<{ id: string; object_path: string }>();
    if (reserved.error?.code === "P0001") throw new ApiError(429, "UNAVAILABLE", "Upload limit reached. Try again in 10 minutes.");
    if (reserved.error || !reserved.data) throw new ApiError(503, "UNAVAILABLE", "Could not prepare the image upload.");
    const signed = await db.storage.from("upload-staging").createSignedUploadUrl(reserved.data.object_path, { upsert: false });
    if (signed.error || !signed.data) throw new ApiError(503, "UNAVAILABLE", "Could not prepare image storage.");
    return ok({ ticketId: reserved.data.id, signedUrl: signed.data.signedUrl }, 201);
  });
}
