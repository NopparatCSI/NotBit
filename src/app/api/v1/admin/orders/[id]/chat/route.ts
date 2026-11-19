import { z } from "zod";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireStaff } from "@/lib/auth/viewer";
import { getConversation } from "@/lib/admin/queries";
import { loadOrder, writeAudit } from "@/lib/orders/context";
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const staff = await requireStaff();
    const order = await loadOrder((await params).id);
    const before = new URL(request.url).searchParams.get("before");
    if (before && !z.uuid().safeParse(before).success) throw new ApiError(400, "INVALID_INPUT", "Invalid message cursor.");
    await writeAudit(staff, order.id, "CHAT_PAGE_VIEWED", { before });
    return ok(await getConversation(order, before ?? undefined));
  });
}
