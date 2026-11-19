import { escrowAbi, requiredConfirmations } from "@marketplace/shared";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireViewer } from "@/lib/auth/viewer";
import { getCheckedEscrowClient, getEscrowConfig } from "@/lib/chain/config";
export function GET() {
  return handle(async () => {
    const viewer = await requireViewer(), config = getEscrowConfig();
    if (!config) throw new ApiError(503, "UNAVAILABLE", "Escrow is not configured.");
    const client = await getCheckedEscrowClient(config);
    try {
      const tip = await client.getBlockNumber({ cacheTime: 0 });
      const blockNumber = tip >= BigInt(requiredConfirmations - 1) ? tip - BigInt(requiredConfirmations - 1) : 0n;
      const balance = await client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "pendingPayouts", args: [viewer.wallet], blockNumber });
      return ok({ wallet: viewer.wallet, chainId: config.chainId, escrowAddress: config.escrowAddress, pendingWei: balance.toString() });
    } catch { throw new ApiError(503, "UNAVAILABLE", "Could not verify your queued payment. Try again."); }
  });
}
