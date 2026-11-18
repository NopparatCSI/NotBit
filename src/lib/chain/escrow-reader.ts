import "server-only";
import type { Hex } from "viem";
import { escrowAbi, orderStatuses, type EscrowReader, type OrderSnapshot } from "@marketplace/shared";
import { createEscrowClient, type EscrowConfig } from "./config";

export type ChainOrder = OrderSnapshot & {
  deliveryHash: Hex;
  receiptHash: Hex;
  decisionHash: Hex;
};

// Reads the current contract state. Used to confirm the indexed projection is not stale
// before the server signs a receipt or prepares a decision.
export function createChainEscrowReader(config: EscrowConfig): EscrowReader & {
  getChainOrder(orderId: Hex): Promise<ChainOrder | null>;
} {
  const client = createEscrowClient(config);
  async function getChainOrder(orderId: Hex): Promise<ChainOrder | null> {
    const order = await client.readContract({
      address: config.escrowAddress, abi: escrowAbi, functionName: "getOrder", args: [orderId],
    });
    const status = orderStatuses[order.status];
    if (!status || status === "NONE") return null;
    return {
      orderId: orderId.toLowerCase() as Hex,
      listingId: order.listingId.toLowerCase() as Hex,
      buyer: order.buyer.toLowerCase() as Hex,
      seller: order.seller.toLowerCase() as Hex,
      amountWei: order.amount.toString(),
      deadline: Number(order.deadline),
      status,
      deliveryHash: order.deliveryHash,
      receiptHash: order.receiptHash,
      decisionHash: order.decisionHash,
    };
  }
  return {
    getChainOrder,
    getOrder: getChainOrder,
    async isFundingPaused() {
      return client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "fundingPaused" });
    },
  };
}