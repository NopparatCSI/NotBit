import type { Agreement, OrderFunding } from "@/lib/offers/model";

export type OrderSide = "buy" | "sell";
export type AccountOrder = {
  id: string;
  conversationId: string;
  amountWei: string;
  agreement: Agreement | null;
  createdAt: string;
  expiresAt: string;
};

export const ordersPageSize = 10;

export function ordersPage(value: string | string[] | undefined) {
  const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= Math.floor(2_147_483_647 / ordersPageSize) ? page : 1;
}

export function orderStatusLabel(order: AccountOrder, funding: OrderFunding | null, side: OrderSide, now: number) {
  if (!funding) return "Checking status";
  if (funding.status === "CONFIRMED") {
    if ((funding.orderStatus === "FUNDED" || funding.orderStatus === "DELIVERED") &&
        funding.deadline !== null && now >= funding.deadline * 1000) return "Requires admin review";
    switch (funding.orderStatus) {
      case "FUNDED": return side === "buy" ? "Awaiting delivery" : "To deliver";
      case "DELIVERED": return side === "buy" ? "Confirm receipt" : "Awaiting buyer receipt";
      case "IN_REVIEW": return "Under review";
      case "RELEASED": return "Completed";
      case "REFUNDED": return "Refunded";
      default: return "Checking status";
    }
  }
  if (funding.status === "SUBMITTED" || funding.status === "CONFIRMING") return "Confirming deposit";
  if (funding.status === "FAILED") return "Deposit failed";
  if (now >= new Date(order.expiresAt).getTime()) return "Offer expired";
  return side === "buy" ? "Awaiting deposit" : "Awaiting buyer deposit";
}
