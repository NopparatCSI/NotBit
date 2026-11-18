import { z } from "zod";
import { decisionSchema, hashDecision } from "@marketplace/shared";
import { readJson } from "@/lib/api/body";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireStaff } from "@/lib/auth/viewer";
import { getEscrowConfig, matchesEscrow } from "@/lib/chain/config";
import { createChainEscrowReader } from "@/lib/chain/escrow-reader";
import { loadOrder, requireService, writeAudit } from "@/lib/orders/context";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  refundBuyer: z.boolean({ error: "Choose refund or release." }),
  reason: z.string().trim().min(1, "Write the reason for the decision.").max(2000, "Keep the reason under 2,000 characters."),
});

// Stores the reason and its hash, then returns the arguments for resolveDispute. The
// staff wallet sends the transaction. The indexer links DisputeResolved back to this draft.
export function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const staff = await requireStaff();
    const order = await loadOrder(id);
    const body = await readJson(request, bodySchema);
    if (order.status !== "IN_REVIEW") {
      throw new ApiError(409, "CONFLICT", "Only orders under review can be decided. Each order is decided once.");
    }

    const config = getEscrowConfig();
    if (config && matchesEscrow(config, order.chain_id, order.escrow_address)) {
      const chainOrder = await createChainEscrowReader(config).getChainOrder(order.chain_order_id)
        .catch(() => { throw new ApiError(503, "UNAVAILABLE", "Could not read the order from the chain. Try again."); });
      if (chainOrder?.status !== "IN_REVIEW") {
        throw new ApiError(409, "CONFLICT", "The order is no longer under review on-chain. Refresh the page.");
      }
    }

    const decision = decisionSchema.parse({ orderId: order.chain_order_id, ...body });
    const decisionHash = hashDecision(decision);
    const saved = await requireService().from("decision_drafts").upsert({
      order_id: order.id, staff_id: staff.id, staff_wallet: staff.wallet, refund_buyer: decision.refundBuyer,
      reason: decision.reason, decision_hash: decisionHash,
    }, { onConflict: "order_id,staff_wallet,decision_hash", ignoreDuplicates: true });
    if (saved.error) throw new ApiError(503, "UNAVAILABLE", "Could not save the decision. Try again.");
    await writeAudit(staff, order.id, "DECISION_PREPARED", { refundBuyer: decision.refundBuyer, decisionHash });

    return ok({
      orderId: order.id,
      chainOrderId: order.chain_order_id,
      chainId: order.chain_id,
      escrowAddress: order.escrow_address,
      refundBuyer: decision.refundBuyer,
      decisionHash,
    }, 201);
  });
}