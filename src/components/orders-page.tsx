import Link from "next/link";
import { AccountOrders } from "@/components/account-orders";
import { Button } from "@/components/ui/button";
import { requireTradeUser, ViewerError } from "@/lib/auth/viewer";
import { ordersPage, type OrderSide } from "@/lib/orders/model";
import { listAccountOrders } from "@/lib/orders/server";
import { ChatError } from "@/lib/trade/server";

export async function OrdersPage({ side, pageValue }: { side: OrderSide; pageValue?: string | string[] }) {
  const path = side === "buy" ? "/buy" : "/sell/orders";
  const page = ordersPage(pageValue);
  let content;
  try {
    const viewer = await requireTradeUser();
    const { orders, hasNext } = await listAccountOrders(viewer.id, side, page);
    content = (
      <>
        {orders.length ? <AccountOrders orders={orders} side={side} /> :
          <p className="text-muted-foreground">{page > 1 ? "No orders on this page." : side === "buy" ? "You have no purchase offers or orders yet." : "You have no sales offers or orders yet."}</p>}
        {(page > 1 || hasNext) && <nav aria-label="Order pages" className="flex flex-wrap items-center gap-3">
          {page > 1 ? <Button asChild variant="outline"><Link href={`${path}?page=${page - 1}`}>Previous page</Link></Button> : <Button variant="outline" disabled>Previous page</Button>}
          <span className="text-sm">Page {page}</span>
          {hasNext ? <Button asChild variant="outline"><Link href={`${path}?page=${page + 1}`}>Next page</Link></Button> : <Button variant="outline" disabled>Next page</Button>}
        </nav>}
      </>
    );
  } catch (error) {
    if (error instanceof ViewerError && error.status === 401) {
      content = <Button asChild className="self-start"><Link href={`/account?returnTo=${encodeURIComponent(path)}`}>Sign in with MetaMask</Link></Button>;
    } else if (error instanceof ViewerError || error instanceof ChatError) {
      content = <p role="alert">{error instanceof ViewerError && error.status === 403 ? "Use a trading account to view orders." : error.message}</p>;
    } else throw error;
  }
  return (
    <div className="page-width flex flex-col gap-6 py-10 sm:py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">{side === "buy" ? "Purchases" : "Sales orders"}</h1>
      <nav aria-label="Account trading" className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href={side === "buy" ? "/#marketplace" : "/sell"}>{side === "buy" ? "Browse items" : "Manage listings"}</Link></Button>
        <Button asChild variant="outline"><Link href="/trade">Messages</Link></Button>
        <Button asChild variant="outline"><Link href={side === "buy" ? "/sell/orders" : "/buy"}>{side === "buy" ? "Sales orders" : "Purchases"}</Link></Button>
      </nav>
      {content}
    </div>
  );
}
