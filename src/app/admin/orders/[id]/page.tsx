import Link from "next/link";
import { notFound } from "next/navigation";
import { splitPayment } from "@marketplace/shared";
import { EvidencePanel } from "@/components/admin/evidence-panel";
import { DecisionForm, EscalateButton } from "@/components/admin/staff-actions";
import { actionLabels, formatEth, formatTime, shortHex, statusLabels, timeLeft } from "@/lib/admin/format";
import {
  getConversation, getEvidenceReceipts, getOrderTimeline, listAuditLogs, logOrderVisit,
} from "@/lib/admin/queries";
import { ApiError } from "@/lib/api/response";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import type { EvidenceItem } from "@/lib/evidence/files";
import { loadOrder, requireService } from "@/lib/orders/context";

export const dynamic = "force-dynamic";

const eventLabels: Record<string, string> = {
  OrderFunded: "Buyer deposit confirmed",
  DeliveryConfirmed: "Seller confirmed delivery",
  ReceiptConfirmed: "Buyer confirmed receipt",
  OrderInReview: "Moved to review",
  DisputeResolved: "Staff decision recorded",
  OrderReleased: "Paid to seller and platform",
  OrderRefunded: "Refunded to buyer",
};

const agreementLabels: [string, string][] = [
  ["title", "Item"], ["quantity", "Quantity"], ["gameSlug", "Game"], ["region", "Server / region"],
  ["buyerCharacter", "Buyer character"], ["sellerCharacter", "Seller character"],
  ["deliveryMethod", "Delivery method"], ["meetingTime", "Meeting time"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm break-all" : "text-sm"}>{value}</dd>
    </div>
  );
}

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

  const split = splitPayment(order.amount_wei);
  const overdue = (order.status === "FUNDED" || order.status === "DELIVERED") && new Date(order.deadline).getTime() <= Date.now();
  const openedBy = order.review_expired ? "Deadline passed (no party opened it)"
    : order.dispute_opened_by === order.buyer_id ? "Buyer" : order.dispute_opened_by === order.seller_id ? "Seller" : "—";
  const target = { chainId: order.chain_id, escrowAddress: order.escrow_address, staffWallet: staff.wallet };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-muted-foreground underline">Back to review queue</Link>
        <h1 className="text-3xl font-semibold tracking-tight">{order.listing_title}</h1>
        <p className="text-muted-foreground">{statusLabels[order.status]} · {formatEth(order.amount_wei)}</p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Order ID" value={order.id} mono />
        <Field label="On-chain order ID" value={order.chain_order_id} mono />
        <Field label={order.status === "DELIVERED" ? "Receipt deadline" : "Delivery deadline"}
          value={`${formatTime(order.deadline)} · ${timeLeft(order.deadline)}`} />
        <Field label="Buyer" value={`${order.buyer_name ?? "No display name"} · ${order.buyer_wallet}`} mono />
        <Field label="Seller" value={`${order.seller_name ?? "No display name"} · ${order.seller_wallet}`} mono />
        <Field label="Funded" value={formatTime(order.funded_at)} />
      </dl>

      {order.status === "IN_REVIEW" && (
        <Section title="Decide">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Opened by" value={openedBy} />
            <Field label="In review since" value={formatTime(order.in_review_at)} />
          </dl>
          <p className="text-sm whitespace-pre-wrap">
            {order.dispute_reason ?? <span className="text-muted-foreground">No reason was given.</span>}
          </p>
          <DecisionForm orderId={order.id} {...target}
            refundText={`Buyer receives ${formatEth(order.amount_wei)}. No platform fee. Gas already spent is not refunded.`}
            releaseText={`Seller receives ${formatEth(split.sellerWei)} (95%). Platform receives ${formatEth(split.feeWei)} (5%).`} />
        </Section>
      )}

      {overdue && (
        <Section title="Overdue">
          <p className="text-sm text-muted-foreground">
            The {order.status === "FUNDED" ? "delivery" : "receipt"} deadline passed {timeLeft(order.deadline).replace(" overdue", "")} ago.
            Moving it to review keeps the funds in escrow for a decision.
          </p>
          <EscalateButton orderId={order.id} chainOrderId={order.chain_order_id} {...target} />
        </Section>
      )}

      {order.resolved_at && (
        <Section title="Decision">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Result" value={order.refund_buyer ? "Refunded to buyer" : "Paid to seller per the deal"} />
            <Field label="Decided" value={`${formatTime(order.resolved_at)} by ${shortHex(order.resolver_wallet)}`} />
            <Field label="Decision hash" value={order.decision_hash} mono />
            {order.settled_at && <Field label="Seller / platform"
              value={`${formatEth(order.seller_amount_wei ?? "0") } / ${formatEth(order.fee_wei ?? "0")}`} />}
          </dl>
          <p className="text-sm whitespace-pre-wrap">{order.decision_reason}</p>
        </Section>
      )}

      <Section title="Agreement">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agreementLabels.map(([key, label]) => (
            <Field key={key} label={label}
              value={key === "meetingTime" && typeof order.agreement[key] === "string"
                ? formatTime(order.agreement[key] as string) : String(order.agreement[key] ?? "—")} />
          ))}
        </dl>
        <Field label="Agreement hash (on-chain)" value={order.agreement_hash} mono />
      </Section>

      <Section title="Evidence">
        <EvidencePanel orderId={order.id} items={evidence} canVerify receiptLinks={receiptLinks} />
      </Section>

      <Section title="Chat">
        {chat.length === 0 ? <p className="text-sm text-muted-foreground">No messages.</p> : (
          <ol className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {chat.map((message) => (
              <li key={message.id} className={message.from === "SYSTEM"
                ? "rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground"
                : "rounded-lg bg-card p-2 text-sm"}>
                <p className="text-xs text-muted-foreground">
                  {message.from === "SYSTEM" ? "NOTBIT system" : message.from === "BUYER" ? "Buyer" : "Seller"} · {formatTime(message.created_at)}
                </p>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="On-chain timeline">
        {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No confirmed events yet.</p> : (
          <ol className="flex flex-col gap-2">
            {timeline.map((event) => (
              <li key={`${event.tx_hash}-${event.log_index}`} className="flex flex-col gap-0.5 text-sm">
                <span className="font-semibold">{eventLabels[event.event_name] ?? event.event_name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(event.block_timestamp)} · block {event.block_number} ·{" "}
                  {order.chain_id === 11155111
                    ? <a className="underline" href={`https://sepolia.etherscan.io/tx/${event.tx_hash}`} target="_blank" rel="noreferrer">{shortHex(event.tx_hash)}</a>
                    : <span className="font-mono">{shortHex(event.tx_hash)}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Staff activity on this order">
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No staff activity yet.</p> : (
          <ol className="flex flex-col gap-1 text-sm">
            {history.map((entry) => (
              <li key={entry.id}>
                {actionLabels[entry.action] ?? entry.action} · {shortHex(entry.staff?.wallet)} · {formatTime(entry.created_at)}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}