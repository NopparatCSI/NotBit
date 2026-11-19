import { bytes32Schema } from "@marketplace/shared";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireStaff } from "@/lib/auth/viewer";
import { getEscrowConfig } from "@/lib/chain/config";
import { requireService } from "@/lib/orders/context";
export function GET(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(), config = getEscrowConfig();
    const hash = bytes32Schema.safeParse(new URL(request.url).searchParams.get("hash"));
    if (!hash.success) throw new ApiError(400, "INVALID_INPUT", "Invalid transaction hash.");
    if (!config) throw new ApiError(503, "UNAVAILABLE", "Escrow is unavailable.");
    const result = await requireService().from("staff_transactions").select("tx_hash,status,order_id,action,payload,updated_at")
      .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).eq("staff_id", staff.id).eq("tx_hash", hash.data).maybeSingle();
    if (result.error) throw new ApiError(503, "UNAVAILABLE", "Could not check staff transaction history.");
    return ok({ transaction: result.data });
  });
}
