import { z } from "zod";
import { ApiError, handle } from "@/lib/api/response";
import { requireStaff } from "@/lib/auth/viewer";
import { loadOrder, requireService, writeAudit } from "@/lib/orders/context";

export function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  return handle(async () => {
    const staff = await requireStaff();
    const { id, messageId } = await params;
    const order = await loadOrder(id);
    if (!z.uuid().safeParse(messageId).success) throw new ApiError(404, "NOT_FOUND", "Chat image not found.");
    const db = requireService();
    const row = await db.from("messages").select("image_path").eq("id", messageId).eq("conversation_id", order.conversation_id).maybeSingle();
    if (row.error) throw new ApiError(503, "UNAVAILABLE", "Could not load the chat image.");
    if (!row.data?.image_path) throw new ApiError(404, "NOT_FOUND", "Chat image not found.");
    await writeAudit(staff, order.id, "CHAT_IMAGE_VIEWED", { messageId });
    const image = await db.storage.from("chat-images").download(row.data.image_path);
    if (image.error || !image.data) throw new ApiError(503, "UNAVAILABLE", "Could not open the chat image.");
    return new Response(image.data, { headers: { "Content-Type": image.data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
}
