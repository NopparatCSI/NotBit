import { notFound } from "next/navigation";
import { OrderReviewContent } from "@/components/admin/order-review";
import { formatTime, shortHex } from "@/lib/admin/format";
import { getConversation, getEvidenceReceipts, getOrderTimeline, listAuditLogs, logOrderVisit } from "@/lib/admin/queries";
import { ApiError } from "@/lib/api/response";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import type { EvidenceItem } from "@/lib/evidence/files";
import { loadOrder, requireService } from "@/lib/orders/context";

export const dynamic = "force-dynamic";

export default async function OrderReview({ params }: { params: Promise<{ id: string }> }) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    if (error instanceof ViewerError) return null;
    throw error;
  }
  const { id } = await params;
  let order;
  try {
    order = await loadOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  await logOrderVisit(staff, order.id);
  const [timeline, chat, receipts, history, evidenceRows] = await Promise.all([
    getOrderTimeline(order), getConversation(order), getEvidenceReceipts(order.id), listAuditLogs(50, order.id),
    requireService().from("evidence").select("id, stage, submitted_by, file_hash, content_type, size_bytes, created_at")
      .eq("order_id", order.id).order("created_at").order("id"),
  ]);
  if (evidenceRows.error) throw new Error("Could not load evidence.");

  const evidence = (evidenceRows.data as { id: string; stage: EvidenceItem["stage"]; submitted_by: string; file_hash: string;
    content_type: string; size_bytes: number; created_at: string }[]).map((row) => ({
    id: row.id, stage: row.stage, submittedBy: row.submitted_by === order.buyer_id ? "BUYER" as const : "SELLER" as const,
    fileHash: row.file_hash, contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at,
    createdText: formatTime(row.created_at),
  }));
  // Mark which upload batch became the on-chain delivery / receipt hash.
  const receiptLinks: Record<string, string> = {};
  for (const receipt of receipts) {
    const onChain = receipt.evidence_hash === order.delivery_hash || receipt.evidence_hash === order.receipt_hash;
    for (const evidenceId of receipt.evidence_ids) {
      receiptLinks[evidenceId] = `Signed ${receipt.stage.toLowerCase()} receipt ${shortHex(receipt.evidence_hash)}`
        + (onChain ? " · used on-chain" : " · not used on-chain");
    }
  }

  return <OrderReviewContent order={order} staffWallet={staff.wallet} timeline={timeline} chat={chat} history={history} evidence={evidence} receiptLinks={receiptLinks} />;
}
