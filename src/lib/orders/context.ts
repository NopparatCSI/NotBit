import "server-only";
import { z } from "zod";
import type { OrderStatus, Viewer } from "@marketplace/shared";
import { ApiError } from "@/lib/api/response";
import { requireViewer } from "@/lib/auth/viewer";
import type { OrderParty } from "@/lib/evidence/files";
import { getServiceSupabase } from "@/lib/supabase/services";

// Columns of public.staff_order_overview (see the Developer 3 migration).
export type OrderOverview = {
  id: string;
  status: Exclude<OrderStatus, "NONE">;
  on_chain: boolean;
  deadline: string;
  funded_at: string;
  updated_at: string;
  chain_id: number;
  escrow_address: string;
  chain_order_id: `0x${string}`;
  amount_wei: string;
  buyer_wallet: string;
  seller_wallet: string;
  agreement_hash: string | null;
  delivery_hash: string | null;
  receipt_hash: string | null;
  decision_hash: string | null;
  review_expired: boolean | null;
  in_review_at: string | null;
  refund_buyer: boolean | null;
  resolved_at: string | null;
  seller_amount_wei: string | null;
  fee_wei: string | null;
  settled_at: string | null;
  conversation_id: string;
  agreement: Record<string, unknown>;
  buyer_id: string;
  seller_id: string;
  listing_title: string;
  game_slug: string;
  listing_id: string;
  buyer_name: string | null;
  seller_name: string | null;
  dispute_reason: string | null;
  dispute_opened_by: string | null;
  dispute_created_at: string | null;
  decision_reason: string | null;
  resolver_wallet: string | null;
};

export function requireService() {
  const supabase = getServiceSupabase();
  if (!supabase) throw new ApiError(503, "UNAVAILABLE", "The server database key is not configured.");
  return supabase;
}

export async function loadOrder(id: string): Promise<OrderOverview> {
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const { data, error } = await requireService()
    .from("staff_order_overview").select("*").eq("id", id.toLowerCase()).maybeSingle<OrderOverview>();
  if (error) throw new ApiError(503, "UNAVAILABLE", "Could not load the order. Try again.");
  // Orders appear after the deposit has 3 confirmations and the indexer has run.
  if (!data || !data.on_chain) throw new ApiError(404, "NOT_FOUND", "Order not found or the deposit is not confirmed yet.");
  return data;
}

export function partyOf(viewer: Viewer, order: OrderOverview): OrderParty | null {
  if (viewer.role !== "USER") return null;
  if (viewer.id === order.buyer_id && viewer.wallet === order.buyer_wallet) return "BUYER";
  if (viewer.id === order.seller_id && viewer.wallet === order.seller_wallet) return "SELLER";
  return null;
}

export const isStaffRole = (viewer: Viewer) => viewer.role === "ADMIN" || viewer.role === "SUPER_ADMIN";

// Loads the order for a counterparty or staff member. Outsiders get 404 so order IDs leak nothing.
export async function requireOrderAccess(id: string) {
  const viewer = await requireViewer();
  const order = await loadOrder(id);
  const party = partyOf(viewer, order);
  if (!party && !isStaffRole(viewer)) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  return { viewer, order, party, isStaff: isStaffRole(viewer) };
}

export async function writeAudit(staff: Viewer, orderId: string | null, action: string, details: Record<string, unknown> = {}) {
  const { error } = await requireService().from("audit_logs").insert({
    staff_id: staff.id, order_id: orderId, action, details: { ...details, wallet: staff.wallet, role: staff.role },
  });
  if (error) throw new ApiError(503, "UNAVAILABLE", "Could not record staff activity, so the action was stopped.");
}