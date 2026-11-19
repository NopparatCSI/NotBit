"use client";

import Link from "next/link";
import { demoGames, splitPayment, type ApiResult } from "@marketplace/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import type { OrderFunding } from "@/lib/offers/model";
import { orderStatusLabel, type AccountOrder, type OrderSide } from "@/lib/orders/model";

const orderDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
type OrderCheck = { funding: OrderFunding | null; error: string | null };

export function AccountOrders({ orders, side }: { orders: AccountOrder[]; side: OrderSide }) {
  const [checks, setChecks] = useState<Record<string, OrderCheck>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const inFlight = useRef<{ signal?: AbortSignal } | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current && !inFlight.current.signal?.aborted) return;
    const request = { signal };
    inFlight.current = request;
    setRefreshing(true);
    try {
      // Limit concurrent RPC-backed requests while retaining independently checked order states.
      for (let offset = 0; offset < orders.length && !signal?.aborted; offset += 3) {
        await Promise.all(orders.slice(offset, offset + 3).map(async (order) => {
          let check: OrderCheck;
          try {
            const response = await fetch(`/api/v1/orders/${order.id}`, { cache: "no-store", signal });
            const body: ApiResult<OrderFunding> = await response.json();
            if ("error" in body) throw new Error(body.error.message);
            if (!response.ok) throw new Error("Could not verify this order.");
            check = { funding: body.data, error: null };
          } catch (failure) {
            if (signal?.aborted) return;
            check = { funding: null, error: failure instanceof Error ? failure.message : "Order verification is temporarily unavailable." };
          }
          if (signal?.aborted) return;
          setNow(Date.now());
          setChecks((current) => ({ ...current, [order.id]: check }));
        }));
      }
    } finally {
      if (inFlight.current === request) { inFlight.current = null; setRefreshing(false); }
    }
  }, [orders]);

  useEffect(() => {
    const controller = new AbortController();
    activeController.current = controller;
    function sync() { void refresh(controller.signal); }
    sync();
    const interval = window.setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", sync); };
  }, [refresh]);

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" disabled={refreshing} onClick={() => void refresh(activeController.current?.signal)}>{refreshing ? "Refreshing orders…" : "Refresh orders"}</Button>
      <ul className="grid gap-4">
        {orders.map((order) => {
          const check = checks[order.id];
          const funding = check?.funding ?? null;
          const terms = order.agreement;
          const game = demoGames.find(({ slug }) => slug === terms?.gameSlug)?.name ?? terms?.gameSlug;
          const split = splitPayment(order.amountWei);
          const active = funding?.status === "CONFIRMED" && (funding.orderStatus === "FUNDED" || funding.orderStatus === "DELIVERED");
          return (
            <li key={order.id} className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 wrap-anywhere">
                  <h2 className="text-xl font-semibold">{terms?.title ?? "Item details unavailable"}</h2>
                  {terms && <p className="text-sm text-muted-foreground">{game} · Quantity {terms.quantity}</p>}
                </div>
                <p role="status" className="rounded-md bg-muted px-3 py-1 text-sm font-semibold">{check?.error ? "Status unavailable" : orderStatusLabel(order, funding, side, now)}</p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0 wrap-anywhere"><dt className="text-muted-foreground">Deposit</dt><dd>{formatEther(BigInt(order.amountWei))} ETH</dd></div>
                {side === "sell" && <div className="min-w-0 wrap-anywhere"><dt className="text-muted-foreground">Seller share / Platform fee</dt><dd>{formatEther(BigInt(split.sellerWei))} / {formatEther(BigInt(split.feeWei))} ETH</dd></div>}
                <div className="min-w-0 wrap-anywhere"><dt className="text-muted-foreground">Offer created (UTC)</dt><dd>{orderDate.format(new Date(order.createdAt))}</dd></div>
                {active && funding.deadline !== null && <div><dt className="text-muted-foreground">{funding.orderStatus === "FUNDED" ? "Delivery" : "Receipt"} deadline (UTC)</dt><dd>{orderDate.format(new Date(funding.deadline * 1000))}</dd></div>}
              </dl>
              {terms && <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">Agreement</summary>
                <dl className="grid gap-3 py-2 wrap-anywhere sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Buyer character / Seller character</dt><dd>{terms.buyerCharacter} / {terms.sellerCharacter}</dd></div>
                  <div><dt className="text-muted-foreground">Region / Delivery method</dt><dd>{terms.region} / {terms.deliveryMethod}</dd></div>
                  <div><dt className="text-muted-foreground">Meeting time (UTC)</dt><dd>{orderDate.format(new Date(terms.meetingTime))}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">Character names have not been verified with the game.</p>
              </details>}
              <p className="text-xs text-muted-foreground wrap-anywhere">Order ID · {order.id}</p>
              {check?.error && <p role="alert" className="text-sm text-destructive wrap-anywhere">{check.error}</p>}
              <Button asChild><Link href={`/trade/${order.conversationId}?order=${order.id}`}>Open deal</Link></Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
