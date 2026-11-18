import Link from "next/link";
import { formatEth, formatTime, shortHex, statusLabels, timeLeft } from "@/lib/admin/format";
import type { OrderOverview } from "@/lib/orders/context";

export function OrderList({ orders, empty, detail }: {
  orders: OrderOverview[];
  empty: string;
  detail: (order: OrderOverview) => string;
}) {
  if (orders.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {orders.map((order) => (
        <li key={order.id} className="border-b border-border">
          <Link href={`/admin/orders/${order.id}`}
            className="grid gap-1 py-3 hover:bg-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6 sm:px-2">
            <span className="font-semibold">{order.listing_title}</span>
            <span className="text-sm sm:text-right">{formatEth(order.amount_wei)}</span>
            <span className="text-sm text-muted-foreground">
              {statusLabels[order.status]} · {detail(order)}
            </span>
            <span className="font-mono text-xs text-muted-foreground sm:text-right">{shortHex(order.chain_order_id)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const reviewDetail = (order: OrderOverview) =>
  `${order.review_expired ? "Deadline passed" : "Dispute opened"} ${formatTime(order.in_review_at)}`;
export const overdueDetail = (order: OrderOverview) => timeLeft(order.deadline);
export const resolvedDetail = (order: OrderOverview) => `Decided ${formatTime(order.resolved_at)}`;