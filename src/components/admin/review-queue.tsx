"use client";

import { useState } from "react";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderList, overdueDetail, resolvedDetail, reviewDetail, type QueueOrder } from "./order-list";
import { AdminEmpty, AdminHeading } from "./ui";
import { RefreshButton } from "./navigation";

type QueueName = "review" | "overdue" | "resolved";
const queues = [
  { key: "review", title: "In review", summary: "Awaiting a decision", icon: "inbox", hint: "Disputes and escalated orders. Oldest first.", empty: "You're all caught up", description: "Orders that need a staff decision will appear here. Funds stay in escrow until a decision is confirmed." },
  { key: "overdue", title: "Overdue", summary: "Past their deadline", icon: "clock", hint: "Past the deadline, waiting to move into review. Oldest first.", empty: "No overdue orders", description: "Orders that pass their delivery or receipt deadline will appear here. You can move them into review." },
  { key: "resolved", title: "Resolved", summary: "Recent decisions", icon: "check", hint: "The 10 most recent decisions. Newest first.", empty: "No decisions yet", description: "Once a staff decision is confirmed, the order and its outcome will appear here." },
] as const;

export function ReviewQueueContent({ review, overdue, resolved }: Record<QueueName, QueueOrder[]>) {
  const [active, setActive] = useState<QueueName>("review");
  const [search, setSearch] = useState("");
  const data = { review, overdue, resolved };
  return <div className="admin-page-stack">
    <AdminHeading eyebrow="ORDER OPERATIONS" title="Review queue" description="A clear view of the orders that need your attention. Review the evidence, then decide what happens next." action={<RefreshButton />} />
    <div className="admin-stats">
      {queues.map(queue => <Card key={queue.key} className="admin-stat">
        <CardContent><div className="admin-stat-top"><p><span className="admin-stat-label">{queue.summary}</span><span className="admin-stat-short">{queue.title}</span></p><MarketplaceIcon name={queue.icon} /></div>
          <p className="admin-stat-value">{data[queue.key].length}{queue.key !== "resolved" && data[queue.key].length === 100 ? "+" : ""}</p>
          <p className="text-xs text-muted-foreground">{queue.key === "resolved" ? "Latest 10 orders" : queue.key === "overdue" ? "Ready to escalate" : "Funds held in escrow"}</p>
        </CardContent>
      </Card>)}
    </div>
    <Card className="admin-panel admin-queue-panel"><CardContent>
      <Tabs value={active} onValueChange={value => { setActive(value as QueueName); setSearch(""); }}>
        <div className="admin-queue-toolbar">
          <TabsList variant="line" aria-label="Order queues">
            {queues.map(queue => <TabsTrigger key={queue.key} value={queue.key}>{queue.title}<span className="admin-tab-count">{data[queue.key].length}</span></TabsTrigger>)}
          </TabsList>
          <div className="admin-search">
            <label htmlFor="queue-search"><MarketplaceIcon name="search" /><span className="sr-only">Search the current queue by item or order ID</span></label>
            <Input id="queue-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item or order ID" />
          </div>
        </div>
        {queues.map(queue => {
          const needle = search.trim().toLowerCase();
          const orders = data[queue.key].filter(order => `${order.listing_title} ${order.id} ${order.chain_order_id} ${order.game_slug}`.toLowerCase().includes(needle));
          const detail = queue.key === "review" ? reviewDetail : queue.key === "overdue" ? overdueDetail : resolvedDetail;
          return <TabsContent key={queue.key} value={queue.key}>
            <div className="admin-queue-caption"><p>{queue.hint}</p><span role="status">{orders.length} {orders.length === 1 ? "order" : "orders"}</span></div>
            {data[queue.key].length === 0 ? <AdminEmpty icon={queue.icon} title={queue.empty} description={queue.description} />
              : orders.length === 0 ? <div><AdminEmpty icon="search" title="No matching orders" description="Try another item name, game, or order ID in this queue." /><div className="flex justify-center pb-6"><Button variant="outline" onClick={() => setSearch("")}>Clear search</Button></div></div>
                : <OrderList orders={orders} empty={queue.empty} detail={detail} />}
          </TabsContent>;
        })}
      </Tabs>
    </CardContent></Card>
    <p className="admin-footnote"><MarketplaceIcon name="shield" />Escrow protects the funds. A missed deadline never triggers an automatic payment or refund.</p>
  </div>;
}
