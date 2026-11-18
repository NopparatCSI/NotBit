import { z } from "zod";
import { readJson } from "@/lib/api/body";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireTradeUser } from "@/lib/auth/viewer";
import { loadOrder, partyOf, requireService } from "@/lib/orders/context";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().trim().min(1, "Describe the problem.").max(2000, "Keep the reason under 2,000 characters."),
});

// Saves the counterparty's reason before the openDispute transaction. The order moves to
// IN_REVIEW only after the indexer confirms OrderInReview on-chain.
export function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const viewer = await requireTradeUser();
    const order = await loadOrder(id);
    if (!partyOf(viewer, order)) throw new ApiError(404, "NOT_FOUND", "Order not found.");
    const { reason } = await readJson(request, bodySchema);

    const supabase = requireService();
    const canOpen = order.status === "FUNDED" || order.status === "DELIVERED";
    // An expired escalation creates a review without a reason. Either party may add one.
    const canExplain = order.status === "IN_REVIEW" && !order.dispute_reason;
    if (!canOpen && !canExplain) {
      throw new ApiError(409, "CONFLICT", order.status === "IN_REVIEW"
        ? "This order is already under review." : "This order is closed and can no longer be disputed.");
    }

    const existing = await supabase.from("disputes").select("order_id, reason").eq("order_id", order.id).maybeSingle();
    if (existing.error) throw new ApiError(503, "UNAVAILABLE", "Could not load the dispute. Try again.");
    if (existing.data?.reason) {
      throw new ApiError(409, "CONFLICT", "A dispute reason is already recorded for this order.");
    }

    const write = existing.data
      ? await supabase.from("disputes").update({ reason, opened_by: viewer.id })
        .eq("order_id", order.id).is("reason", null).select("order_id")
      : await supabase.from("disputes").insert({ order_id: order.id, opened_by: viewer.id, reason }).select("order_id");
    if (write.error?.code === "23505" || (write.data && write.data.length === 0)) {
      throw new ApiError(409, "CONFLICT", "A dispute reason is already recorded for this order.");
    }
    if (write.error) throw new ApiError(503, "UNAVAILABLE", "Could not save the dispute. Try again.");

    return ok({
      orderId: order.id,
      chainOrderId: order.chain_order_id,
      chainId: order.chain_id,
      escrowAddress: order.escrow_address,
      status: order.status,
      // FUNDED / DELIVERED: the caller now sends openDispute(chainOrderId) from their wallet.
      requiresTransaction: canOpen,
    }, 201);
  });
}