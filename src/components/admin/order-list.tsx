import Link from "next/link";
import { formatEth, formatTime, shortHex, timeLeft } from "@/lib/admin/format";
import type { OrderOverview } from "@/lib/orders/context";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { OrderStatus } from "./ui";

export type QueueOrder = Pick<OrderOverview, "id" | "status" | "listing_title" | "game_slug" | "amount_wei" | "chain_order_id" | "review_expired" | "in_review_at" | "deadline" | "resolved_at">;

export function OrderList({ orders, empty, detail }: {
  orders: QueueOrder[];
  empty: string;
  detail: (order: QueueOrder) => string;
}) {
  if (orders.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="admin-order-list">
      {orders.map((order) => (
        <li key={order.id}>
          <Link href={`/admin/orders/${order.id}`}
            className="admin-order-row">
            <span className="admin-order-symbol"><MarketplaceIcon name="file" /></span>
            <span className="flex min-w-0 flex-col gap-2"><span className="font-semibold leading-snug">{order.listing_title}</span>
              <span className="text-xs text-muted-foreground">{order.game_slug.replaceAll("-", " ")} <span className="font-mono">· {shortHex(order.chain_order_id)}</span></span>
            </span>
            <span className="admin-order-detail"><OrderStatus status={order.status} /><span>{detail(order)}</span></span>
            <span className="admin-order-amount">{formatEth(order.amount_wei)}</span>
            <MarketplaceIcon name="chevron" className="admin-order-arrow" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const reviewDetail = (order: QueueOrder) =>
  `${order.review_expired ? "Deadline passed" : "Dispute opened"} ${formatTime(order.in_review_at)}`;
export const overdueDetail = (order: QueueOrder) => timeLeft(order.deadline);
export const resolvedDetail = (order: QueueOrder) => `Decided ${formatTime(order.resolved_at)}`;
