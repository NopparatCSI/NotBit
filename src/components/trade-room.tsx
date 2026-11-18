"use client";

import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import { demoGames, splitPayment, type ApiResult } from "@marketplace/shared";
import { Tabs } from "radix-ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { TradeOffers } from "@/components/trade-offers";
import { OrderEvidence } from "@/components/order-evidence";
import type { Offer } from "@/lib/offers/model";
import { listingStatusLabel } from "@/lib/listings/model";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { maxChatImageBytes, messageBodySchema, type ChatMessage, type Conversation, type MessagePage } from "@/lib/trade/model";

const messageTime = new Intl.DateTimeFormat("en-GB", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

async function readResult<T>(response: Response): Promise<T> {
  const result: ApiResult<T> = await response.json();
  if ("error" in result) throw new Error(result.error.message);
  if (!response.ok) throw new Error("The request could not be completed.");
  return result.data;
}

function TradeChat({ room, viewerId, initialHistory, active }: {
  room: Conversation; viewerId: string; initialHistory: MessagePage; active: boolean;
}) {
  const endpoint = `/api/v1/conversations/${room.id}/messages`;
  const [history, setHistory] = useState(initialHistory);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ id: string; body: string; image: File | null } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const earlierHeight = useRef<number | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const recent = await readResult<MessagePage>(await fetch(endpoint, { cache: "no-store", signal }));
    setHistory((current) => {
      if (current.messages.length === 0) return recent;
      if (recent.messages.length === 0) return current;
      const latestLocal = current.messages.at(-1)!;
      const earliestRemote = recent.messages[0];
      // Restart pagination when a long disconnect left a gap between the two pages.
      if (recent.nextBefore && earliestRemote.createdAt > latestLocal.createdAt) return recent;
      return { ...current, messages: mergeMessages(current.messages, recent.messages) };
    });
  }, [endpoint]);

  useEffect(() => {
    const config = getSupabaseConfig();
    if (!config) return;
    const controller = new AbortController();
    const supabase = createBrowserClient(config.url, config.key);
    function sync() {
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) setLiveUnavailable(true);
      });
    }
    const channel = supabase.channel(`trade:${room.id}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${room.id}` }, sync);
    void supabase.realtime.setAuth().then(() => {
      if (controller.signal.aborted) return;
      channel.subscribe((status) => {
        if (controller.signal.aborted) return;
        setLiveUnavailable(status !== "SUBSCRIBED");
        if (status === "SUBSCRIBED") sync();
      });
    }).catch(() => {
      if (!controller.signal.aborted) setLiveUnavailable(true);
    });
    window.addEventListener("focus", sync);
    return () => {
      controller.abort();
      window.removeEventListener("focus", sync);
      void supabase.removeChannel(channel);
    };
  }, [refresh, room.id]);

  useLayoutEffect(() => {
    const element = thread.current;
    if (!element || !active) return;
    if (earlierHeight.current !== null) {
      element.scrollTop += element.scrollHeight - earlierHeight.current;
      earlierHeight.current = null;
    } else if (followLatest.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [active, history.messages]);

  async function loadEarlier() {
    if (!history.nextBefore) return;
    setLoadingEarlier(true);
    setError("");
    try {
      const page = await readResult<MessagePage>(await fetch(`${endpoint}?before=${history.nextBefore}`, { cache: "no-store" }));
      earlierHeight.current = thread.current?.scrollHeight ?? null;
      setHistory((current) => ({ messages: mergeMessages(current.messages, page.messages), nextBefore: page.nextBefore }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load earlier messages.");
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const body = draft.trim();
    if (!image && !messageBodySchema.safeParse(body).success) return;

    setSending(true);
    setError("");
    try {
      if (retry.current?.body !== body || retry.current.image !== image) {
        retry.current = { id: crypto.randomUUID(), body, image };
      }
      const { id } = retry.current;
      const payload: RequestInit = { method: "POST" };
      if (image) {
        const form = new FormData();
        form.set("id", id);
        form.set("body", body);
        form.set("image", image);
        payload.body = form;
      } else {
        payload.headers = { "Content-Type": "application/json" };
        payload.body = JSON.stringify({ id, body });
      }
      const message = await readResult<ChatMessage>(await fetch(endpoint, payload));
      followLatest.current = true;
      setHistory((current) => ({ ...current, messages: mergeMessages(current.messages, [message]) }));
      retry.current = null;
      setDraft("");
      setImage(null);
      if (imageInput.current) imageInput.current.value = "";
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      {history.nextBefore && <Button type="button" variant="outline" className="self-start" onClick={loadEarlier} disabled={loadingEarlier}>
        {loadingEarlier ? "Loading…" : "Load earlier messages"}
      </Button>}
      {liveUnavailable && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="status">Live updates are temporarily unavailable.</p>
          <Button type="button" variant="outline" onClick={() => void refresh().catch(() => setError("Could not refresh messages."))}>Refresh messages</Button>
        </div>
      )}
      <div ref={thread} aria-live="polite" className="min-h-48 max-h-[50vh] overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}>
        {history.messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        <ol className="flex flex-col gap-3">
          {history.messages.map((message) => {
            const system = message.kind === "SYSTEM";
            const own = message.senderId === viewerId;
            const label = system ? "System" : own ? "You" : message.senderId === room.sellerId ? "Seller" : "Buyer";
            return (
              <li key={message.id} className={`max-w-[90%] rounded-lg px-3 py-2 wrap-anywhere ${system
                ? "self-center border border-border bg-background" : own ? "self-end bg-primary/20" : "self-start bg-muted"}`}>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span className="font-semibold">{label}</span>
                  <time dateTime={message.createdAt}>{messageTime.format(new Date(message.createdAt))}</time>
                </div>
                {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                {message.hasImage && <Image unoptimized src={`${endpoint}/${message.id}/image`} alt={`Chat image from ${label.toLowerCase()}`}
                  width={320} height={240} className="mt-2 h-auto max-h-64 w-auto max-w-full rounded-md object-contain" />}
              </li>
            );
          })}
        </ol>
      </div>
      <form onSubmit={submit} className="grid gap-2">
        <label htmlFor="trade-message" className="text-sm font-semibold">Message</label>
        <textarea id="trade-message" name="message" rows={3} maxLength={4000} value={draft} disabled={sending} required={!image}
          onChange={(event) => setDraft(event.target.value)} className="w-full rounded-lg border border-border bg-background p-3" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="grid min-w-0 gap-1 text-sm">Attach image <span className="text-muted-foreground">JPEG, PNG, or WebP up to 3 MB</span>
            <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={sending} className="w-full min-w-0"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > maxChatImageBytes) {
                  event.target.value = "";
                  setImage(null);
                  setError("Choose an image up to 3 MB.");
                  return;
                }
                setImage(file);
                setError("");
              }} />
          </label>
          {image && <Button type="button" variant="outline" disabled={sending} onClick={() => {
            setImage(null);
            if (imageInput.current) imageInput.current.value = "";
          }}>Remove image</Button>}
        </div>
        <Button type="submit" className="justify-self-end" disabled={sending || (!draft.trim() && !image)}>{sending ? "Sending…" : "Send message"}</Button>
      </form>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}

export function TradeRoom({ room, viewerId, initialHistory, initialOfferId }: { room: Conversation; viewerId: string; initialHistory: MessagePage; initialOfferId?: string }) {
  const [tab, setTab] = useState(initialOfferId ? "summary" : "chat");
  const [fundedOffers, setFundedOffers] = useState<Offer[]>([]);
  const rememberFunded = useCallback((offer: Offer) => {
    setFundedOffers((current) => current.some(({ id }) => id === offer.id) ? current : [...current, offer]);
  }, []);
  const showEvidence = useCallback(() => setTab("evidence"), []);
  const { listing } = room;
  const game = demoGames.find(({ slug }) => slug === listing.game_slug)?.name ?? listing.game_slug;
  const fee = splitPayment(listing.price_wei).feeWei;

  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="grid min-w-0 gap-4">
      <Tabs.List aria-label="Trading room" className="flex flex-wrap gap-2 [&_[aria-selected=true]]:border-primary [&_[aria-selected=true]]:bg-primary/15">
        <Tabs.Trigger asChild value="summary"><Button variant="outline" type="button">Deal summary</Button></Tabs.Trigger>
        <Tabs.Trigger asChild value="chat"><Button variant="outline" type="button">Chat</Button></Tabs.Trigger>
        <Tabs.Trigger asChild value="evidence"><Button variant="outline" type="button">Evidence</Button></Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="summary" forceMount className="min-w-0 space-y-4 data-[state=inactive]:hidden">
        <section className="rounded-xl border border-border bg-card p-4 wrap-anywhere">
          <h2 className="mb-3 text-xl font-semibold">Deal summary</h2>
          <dl className="grid gap-2">
            <div><dt className="text-muted-foreground">Game</dt><dd>{game}</dd></div>
            <div><dt className="text-muted-foreground">Your role</dt><dd>{viewerId === room.buyerId ? "Buyer" : "Seller"}</dd></div>
            <div><dt className="text-muted-foreground">Listing status</dt><dd>{listingStatusLabel[listing.status]}</dd></div>
            <div><dt className="text-muted-foreground">Listing price</dt><dd>{formatEther(BigInt(listing.price_wei))} Sepolia ETH</dd></div>
            <div><dt className="text-muted-foreground">Estimated platform fee (5%)</dt><dd>{formatEther(BigInt(fee))} Sepolia ETH</dd></div>
            <div><dt className="text-muted-foreground">Quantity</dt><dd>{listing.quantity}</dd></div>
            <div><dt className="text-muted-foreground">Server or region</dt><dd>{listing.region}</dd></div>
            <div><dt className="text-muted-foreground">Delivery method</dt><dd>{listing.delivery_method}</dd></div>
          </dl>
        </section>
        <TradeOffers room={room} viewerId={viewerId} onFunded={rememberFunded} onEvidence={showEvidence} initialOfferId={initialOfferId} />
      </Tabs.Content>
      <Tabs.Content value="chat" forceMount className="min-w-0 data-[state=inactive]:hidden">
        <TradeChat room={room} viewerId={viewerId} initialHistory={initialHistory} active={tab === "chat"} />
      </Tabs.Content>
      <Tabs.Content value="evidence" className="min-w-0 space-y-4">
        {fundedOffers.length === 0 && <p className="text-muted-foreground">Evidence becomes available after the deposit is confirmed.</p>}
        {fundedOffers.map((offer) => <OrderEvidence key={offer.id} offer={offer} buyer={viewerId === room.buyerId} />)}
      </Tabs.Content>
    </Tabs.Root>
  );
}
