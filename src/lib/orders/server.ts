import "server-only";
import { agreementSchema } from "@marketplace/shared";
import { createServerSupabase } from "@/lib/supabase/server";
import { ChatError } from "@/lib/trade/server";
import { ordersPageSize, type AccountOrder, type OrderSide } from "./model";

type AccountOfferRow = {
  id: string;
  conversation_id: string;
  amount_wei: string;
  agreement: unknown;
  created_at: string;
  expires_at: string;
};

export async function listAccountOrders(viewerId: string, side: OrderSide, page: number) {
  const db = await createServerSupabase();
  if (!db) throw new ChatError(503, "UNAVAILABLE", "Account services are unavailable. Please try again later.");
  const offset = (page - 1) * ordersPageSize;
  const { data, error } = await db.from("offers")
    .select("id, conversation_id, amount_wei, agreement, created_at, expires_at")
    .eq(side === "buy" ? "buyer_id" : "seller_id", viewerId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + ordersPageSize).returns<AccountOfferRow[]>();
  if (error) throw new ChatError(503, "UNAVAILABLE", "Could not load your orders. Please try again.");
  const rows = data ?? [];
  const orders: AccountOrder[] = rows.slice(0, ordersPageSize).map((row) => {
    const agreement = agreementSchema.safeParse(row.agreement);
    return {
      id: row.id, conversationId: row.conversation_id, amountWei: row.amount_wei,
      agreement: agreement.success ? agreement.data : null, createdAt: row.created_at, expiresAt: row.expires_at,
    };
  });
  return { orders, hasNext: rows.length > ordersPageSize };
}
