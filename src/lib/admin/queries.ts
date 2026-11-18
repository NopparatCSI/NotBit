import "server-only";
import { escrowAbi, type Viewer } from "@marketplace/shared";
import { createEscrowClient, getEscrowConfig } from "@/lib/chain/config";
import { createChainEscrowReader } from "@/lib/chain/escrow-reader";
import { requireService, type OrderOverview } from "@/lib/orders/context";

export async function listReviewQueue() {
  const supabase = requireService();
  const now = new Date().toISOString();
  const [review, overdue, resolved] = await Promise.all([
    supabase.from("staff_order_overview").select("*").eq("on_chain", true).eq("status", "IN_REVIEW")
      .order("in_review_at", { ascending: true }).limit(100),
    // Past the deadline but not escalated on-chain yet. Contract already blocks the normal path.
    supabase.from("staff_order_overview").select("*").eq("on_chain", true).in("status", ["FUNDED", "DELIVERED"])
      .lte("deadline", now).order("deadline", { ascending: true }).limit(100),
    supabase.from("staff_order_overview").select("*").not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false }).limit(10),
  ]);
  if (review.error || overdue.error || resolved.error) throw new Error("Could not load the review queue.");
  return {
    review: review.data as OrderOverview[],
    overdue: overdue.data as OrderOverview[],
    resolved: resolved.data as OrderOverview[],
  };
}

export type TimelineEvent = {
  tx_hash: string; log_index: number; block_number: number; block_timestamp: string | null;
  event_name: string; payload: Record<string, string | boolean>;
};

export async function getOrderTimeline(order: OrderOverview) {
  const { data, error } = await requireService().from("chain_events")
    .select("tx_hash, log_index, block_number, block_timestamp, event_name, payload")
    .eq("chain_id", order.chain_id).eq("escrow_address", order.escrow_address)
    .eq("payload->>orderId", order.chain_order_id)
    .order("block_number").order("log_index");
  if (error) throw new Error("Could not load the order timeline.");
  return data as TimelineEvent[];
}

export type ChatMessage = { id: string; from: "BUYER" | "SELLER" | "SYSTEM"; body: string; created_at: string };

export async function getConversation(order: OrderOverview): Promise<ChatMessage[]> {
  const { data, error } = await requireService().from("messages")
    .select("id, sender_id, kind, body, created_at").eq("conversation_id", order.conversation_id)
    .order("created_at").order("id").limit(500);
  if (error) throw new Error("Could not load the conversation.");
  return data.map((row) => ({
    id: row.id, body: row.body, created_at: row.created_at,
    from: row.kind === "SYSTEM" ? "SYSTEM" : row.sender_id === order.buyer_id ? "BUYER" : "SELLER",
  }));
}

export async function getEvidenceReceipts(orderId: string) {
  const { data, error } = await requireService().from("evidence_receipts")
    .select("id, stage, evidence_hash, evidence_ids, created_at").eq("order_id", orderId).order("created_at");
  if (error) throw new Error("Could not load evidence receipts.");
  return data as { id: string; stage: "DELIVERY" | "RECEIPT"; evidence_hash: string; evidence_ids: string[]; created_at: string }[];
}

// Opening an order shows chat and evidence metadata, so log it. Repeated refreshes within
// 10 minutes count as the same visit.
export async function logOrderVisit(staff: Viewer, orderId: string) {
  const supabase = requireService();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const recent = await supabase.from("audit_logs").select("id", { count: "exact", head: true })
    .eq("staff_id", staff.id).eq("order_id", orderId).eq("action", "ORDER_REVIEWED").gte("created_at", since);
  if (recent.error) throw new Error("Could not record staff activity.");
  if ((recent.count ?? 0) > 0) return;
  const { error } = await supabase.from("audit_logs").insert({
    staff_id: staff.id, order_id: orderId, action: "ORDER_REVIEWED", details: { wallet: staff.wallet, role: staff.role },
  });
  if (error) throw new Error("Could not record staff activity.");
}

export type AuditEntry = {
  id: number; action: string; order_id: string | null; details: Record<string, unknown>; created_at: string;
  staff: { wallet: string; display_name: string | null } | null;
};

export async function listAuditLogs(limit = 200, orderId?: string) {
  let query = requireService().from("audit_logs")
    .select("id, action, order_id, details, created_at, staff:users!audit_logs_staff_id_fkey(wallet, display_name)")
    .order("created_at", { ascending: false }).limit(limit);
  if (orderId) query = query.eq("order_id", orderId);
  const { data, error } = await query;
  if (error) throw new Error("Could not load staff history.");
  return data as unknown as AuditEntry[];
}

export async function getEscrowOverview() {
  const config = getEscrowConfig();
  const supabase = requireService();
  const [staff, payouts, projected] = await Promise.all([
    supabase.from("staff_wallets").select("wallet, role, created_at").order("role"),
    config
      ? supabase.from("escrow_payout_balances").select("wallet, pending_wei")
        .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).neq("pending_wei", "0")
      : Promise.resolve({ data: [], error: null }),
    config
      ? supabase.from("escrow_funding_state").select("funding_paused, block_number")
        .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (staff.error || payouts.error || projected.error) throw new Error("Could not load escrow settings.");

  let chain: { fundingPaused: boolean; admin: string; superAdmin: string } | null = null;
  if (config) {
    try {
      const reader = createChainEscrowReader(config);
      const client = createEscrowClient(config);
      const [fundingPaused, admin, superAdmin] = await Promise.all([
        reader.isFundingPaused(),
        client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "admin" }),
        client.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "superAdmin" }),
      ]);
      chain = { fundingPaused, admin: admin.toLowerCase(), superAdmin: superAdmin.toLowerCase() };
    } catch {
      chain = null;
    }
  }

  return {
    config: config ? { chainId: config.chainId, escrowAddress: config.escrowAddress } : null,
    staff: staff.data as { wallet: string; role: "ADMIN" | "SUPER_ADMIN"; created_at: string }[],
    payouts: payouts.data as { wallet: string; pending_wei: string }[],
    projectedPaused: (projected.data as { funding_paused: boolean } | null)?.funding_paused ?? false,
    chain,
  };
}