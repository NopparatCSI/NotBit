import Link from "next/link";
import { splitPayment } from "@marketplace/shared";
import type { OrderOverview } from "@/lib/orders/context";
import type { AuditEntry, ConversationPage, TimelineEvent } from "@/lib/admin/queries";
import type { EvidenceItem } from "@/lib/evidence/files";
import { formatEth, formatTime, shortHex, timeLeft } from "@/lib/admin/format";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminEmpty, AdminPanel, OrderStatus } from "./ui";
import { ActivityList } from "./history";
import { EvidencePanel } from "./evidence-panel";
import { DecisionForm, EscalateButton } from "./staff-actions";
import { OrderConversation } from "./conversation";

const events: Record<string, string> = { OrderFunded: "Deposit confirmed", DeliveryConfirmed: "Delivery confirmed", ReceiptConfirmed: "Receipt confirmed", OrderInReview: "Moved to review", DisputeResolved: "Staff decision confirmed", OrderReleased: "Paid to seller and platform", OrderRefunded: "Refunded to buyer" };
const terms = [["title", "Item"], ["quantity", "Quantity"], ["gameSlug", "Game"], ["region", "Server / region"], ["buyerCharacter", "Buyer character"], ["sellerCharacter", "Seller character"], ["deliveryMethod", "Delivery method"], ["meetingTime", "Meeting time"]];

export function OrderReviewContent({ order, staffWallet, timeline, chat, history, evidence, receiptLinks }: {
  order: OrderOverview; staffWallet: string; timeline: TimelineEvent[]; chat: ConversationPage; history: AuditEntry[];
  evidence: (EvidenceItem & { createdText: string })[]; receiptLinks: Record<string, string>;
}) {
  const split = splitPayment(order.amount_wei);
  const overdue = ["FUNDED", "DELIVERED"].includes(order.status) && new Date(order.deadline).getTime() <= Date.now();
  const target = { chainId: order.chain_id, escrowAddress: order.escrow_address, staffWallet };
  const openedBy = order.review_expired ? "Deadline passed" : order.dispute_opened_by === order.buyer_id ? "Opened by buyer" : order.dispute_opened_by === order.seller_id ? "Opened by seller" : "Staff review";
  return <div className="admin-page-stack">
    <div><Link href="/admin" className="admin-inline-link"><MarketplaceIcon name="back" />Back to review queue</Link></div>
    <header className="admin-order-header"><div className="flex min-w-0 flex-col gap-3">
      <p className="admin-eyebrow">ORDER REVIEW · {order.game_slug.replaceAll("-", " ")}</p>
      <h1 className="admin-title">{order.listing_title}</h1><div className="flex flex-wrap items-center gap-3"><OrderStatus status={order.status} /><span className="font-mono text-xs text-muted-foreground">{shortHex(order.chain_order_id)}</span></div>
    </div><div><p className="text-xs text-muted-foreground">Order value</p><p className="admin-money">{formatEth(order.amount_wei)}</p></div></header>
    <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Order sections">{["Evidence", "Agreement", "Chat", "Timeline", ...(order.status === "IN_REVIEW" ? ["Decision"] : [])].map(label => <a key={label} className="admin-inline-link" href={`#${label.toLowerCase()}`}>{label}</a>)}</nav>
    <div className="admin-order-layout"><div className="admin-order-main">
      {(order.status === "IN_REVIEW" || overdue) && <Alert><MarketplaceIcon name="info" /><AlertTitle>{overdue ? "This order is past its deadline" : openedBy}</AlertTitle><AlertDescription><p className="whitespace-pre-wrap">{order.dispute_reason || (overdue ? "The normal delivery or receipt step is no longer available. Move this order to review to make a decision." : "No reason has been provided. Review the agreement, conversation, and evidence before deciding.")}</p></AlertDescription></Alert>}
      <section id="evidence"><AdminPanel title="Evidence" description="Open the private files and compare delivery, receipt, and dispute evidence." action={<Badge variant="outline">{evidence.length} files</Badge>}>
        <EvidencePanel orderId={order.id} items={evidence} canVerify receiptLinks={receiptLinks} />
      </AdminPanel></section>
      <section id="agreement"><AdminPanel title="Original agreement" description="The terms recorded when the buyer and seller agreed to this order.">
        <dl className="admin-summary-grid">{terms.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === "meetingTime" && typeof order.agreement[key] === "string" ? formatTime(order.agreement[key] as string) : String(order.agreement[key] ?? "—")}</dd></div>)}</dl>
        <details className="admin-metadata mt-5"><summary>Agreement hash</summary><p className="break-all font-mono">{order.agreement_hash ?? "Not recorded"}</p></details>
      </AdminPanel></section>
      <section id="chat"><AdminPanel title="Conversation" description="Read the messages in order. System messages are marked separately.">
        <OrderConversation orderId={order.id} page={chat} />
      </AdminPanel></section>
      <section id="timeline"><AdminPanel title="Order timeline" description="Confirmed events recorded from the escrow contract.">
        {timeline.length === 0 ? <AdminEmpty icon="clock" title="No confirmed events yet" description="The order timeline updates after confirmed events are indexed." /> : <ol className="admin-timeline">{timeline.map(event => <li key={`${event.tx_hash}-${event.log_index}`}><p className="text-sm font-semibold">{events[event.event_name] ?? event.event_name}</p><p className="text-xs leading-relaxed text-muted-foreground">{formatTime(event.block_timestamp)}</p>{order.chain_id === 11155111 ? <a className="admin-inline-link" href={`https://sepolia.etherscan.io/tx/${event.tx_hash}`} target="_blank" rel="noreferrer">View transaction<MarketplaceIcon name="arrow" /></a> : <p className="break-all font-mono text-xs text-muted-foreground">{shortHex(event.tx_hash)}</p>}</li>)}</ol>}
      </AdminPanel></section>
      {history.length > 0 && <AdminPanel title="Staff activity" description="Access and actions recorded for this order."><ActivityList entries={history} /></AdminPanel>}
    </div><aside className="admin-order-sidebar" aria-label="Order summary and actions">
      {order.status === "IN_REVIEW" && <section id="decision"><AdminPanel title="Make a decision" description="Review both sides, choose an outcome, and explain your decision.">
        <DecisionForm orderId={order.id} {...target} refundText={`Buyer receives ${formatEth(order.amount_wei)}. No platform fee.`} releaseText={`Seller receives ${formatEth(split.sellerWei)}. Platform fee: ${formatEth(split.feeWei)}.`} />
      </AdminPanel></section>}
      {overdue && <AdminPanel title="Move to review" description="Funds remain in escrow. A staff decision is still required."><EscalateButton orderId={order.id} chainOrderId={order.chain_order_id} {...target} /></AdminPanel>}
      {order.resolved_at && <AdminPanel title="Confirmed decision" description={formatTime(order.resolved_at)} action={<MarketplaceIcon name="check" />}><p className="font-semibold">{order.refund_buyer ? "Refunded to buyer" : "Paid to seller"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{order.decision_reason}</p><p className="mt-4 text-xs text-muted-foreground">Decided by <span className="font-mono">{shortHex(order.resolver_wallet)}</span></p><details className="admin-metadata mt-3"><summary>Settlement details</summary><p className="break-all font-mono text-xs">Decision hash: {order.decision_hash}</p>{order.settled_at && <p>Seller: {formatEth(order.seller_amount_wei ?? "0")}<br />Platform: {formatEth(order.fee_wei ?? "0")}</p>}</details></AdminPanel>}
      <AdminPanel title="Order details"><dl className="admin-summary-grid">
        <div><dt>Buyer</dt><dd>{order.buyer_name || "Buyer"}<br /><span className="font-mono text-xs text-muted-foreground" title={order.buyer_wallet}>{shortHex(order.buyer_wallet)}</span></dd></div>
        <div><dt>Seller</dt><dd>{order.seller_name || "Seller"}<br /><span className="font-mono text-xs text-muted-foreground" title={order.seller_wallet}>{shortHex(order.seller_wallet)}</span></dd></div>
        <div><dt>Funded</dt><dd>{formatTime(order.funded_at)}</dd></div>
        <div><dt>{order.status === "DELIVERED" ? "Receipt deadline" : "Delivery deadline"}</dt><dd>{formatTime(order.deadline)}{["FUNDED", "DELIVERED"].includes(order.status) && <span className="block text-muted-foreground">{timeLeft(order.deadline)}</span>}</dd></div>
      </dl><details className="admin-metadata mt-4"><summary>Order and wallet IDs</summary><dl className="flex flex-col gap-3"><div><dt>Order ID</dt><dd className="break-all font-mono">{order.id}</dd></div><div><dt>On-chain order ID</dt><dd className="break-all font-mono">{order.chain_order_id}</dd></div><div><dt>Buyer wallet</dt><dd className="break-all font-mono">{order.buyer_wallet}</dd></div><div><dt>Seller wallet</dt><dd className="break-all font-mono">{order.seller_wallet}</dd></div></dl></details></AdminPanel>
    </aside></div>
  </div>;
}
