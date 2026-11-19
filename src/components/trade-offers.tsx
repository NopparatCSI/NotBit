"use client";

import { createBrowserClient } from "@supabase/ssr";
import { signTypedData, writeContract } from "@wagmi/core";
import { escrowAbi, hashAgreement, offerLifetime, requiredConfirmations, splitPayment, toChainId, type ApiResult } from "@marketplace/shared";
import { formatEther, parseEther, verifyTypedData } from "viem";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { publicEscrowClient, requireWallet, walletConfig, walletErrorMessage } from "@/lib/wallet";
import { createOfferSchema, matchesAgreement, offerAgreementSchema, offerTypedData, type Offer, type OfferContext, type OrderFunding } from "@/lib/offers/model";
import type { Conversation } from "@/lib/trade/model";

async function result<T>(response: Response): Promise<T> {
  const value: ApiResult<T> = await response.json();
  if ("error" in value) throw new Error(value.error.message);
  if (!response.ok) throw new Error("The request could not be completed.");
  return value.data;
}
const inputClass = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2";
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function formatRemainingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function OfferForm({ room, context, onSaved }: { room: Conversation; context: OfferContext; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Pick<Offer, "agreement" | "signedOffer"> | null>(null);
  const retry = useRef<Pick<Offer, "id" | "agreement" | "signedOffer"> | null>(null);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const fields = new FormData(event.currentTarget);
      const price = String(fields.get("price"));
      if (!/^\d{1,60}(\.\d{1,18})?$/.test(price)) throw new Error("Enter an ETH price with up to 18 decimal places.");
      const date = new Date(String(fields.get("meetingTime")));
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a future meeting time.");
      const agreement = offerAgreementSchema.parse({
        title: room.listing.title, gameSlug: room.listing.game_slug, quantity: Number(fields.get("quantity")),
        region: String(fields.get("region")), deliveryMethod: String(fields.get("deliveryMethod")),
        buyerCharacter: String(fields.get("buyerCharacter")), sellerCharacter: String(fields.get("sellerCharacter")), meetingTime: date.toISOString(),
      });
      const id = crypto.randomUUID();
      const signedOffer = {
        orderId: toChainId(id), listingId: toChainId(room.listing.id), buyer: context.buyer, seller: context.seller,
        amount: parseEther(price).toString(), expiresAt: Math.floor(Date.now() / 1000) + offerLifetime,
        agreementHash: hashAgreement(agreement), signature: `0x${"0".repeat(130)}` as `0x${string}`,
      };
      if (BigInt(signedOffer.amount) <= 0n) throw new Error("The price must be greater than zero.");
      const parsed = createOfferSchema.safeParse({ id, agreement, signedOffer });
      if (!parsed.success || agreement.quantity > room.listing.quantity) throw new Error("Check the quantity and agreement details.");
      retry.current = parsed.data;
      setPreview(parsed.data);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "ZodError" ? failure.message : "Complete all agreement fields.");
    }
  }

  async function signAndSave() {
    if (!retry.current) return;
    setBusy(true);
    setError("");
    try {
      let input = retry.current;
      if (/^0x0+$/.test(input.signedOffer.signature)) {
        const connector = await requireWallet(context.seller, context.chainId);
        input = { ...input, signedOffer: { ...input.signedOffer, expiresAt: Math.floor(Date.now() / 1000) + offerLifetime } };
        const signature = await signTypedData(walletConfig, { ...offerTypedData({ ...context, ...input }), account: context.seller, connector });
        input.signedOffer.signature = signature;
        retry.current = input;
      }
      await result<Offer>(await fetch(`/api/v1/conversations/${room.id}/offers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      }));
      retry.current = null;
      setPreview(null);
      onSaved();
    } catch (failure) {
      setError(walletErrorMessage(failure));
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">Create offer</h2>
      {preview ? (
        <>
          <OfferTerms offer={{ ...preview, ...context, id: retry.current!.id, status: "OPEN" }} />
          <p className="text-sm text-muted-foreground">Character names are provided by the traders and have not been verified with the game. The offer expires 30 minutes after signing.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={signAndSave}>{busy ? "Waiting for MetaMask…" : "Sign and send offer"}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setPreview(null); retry.current = null; }}>Edit terms</Button>
          </div>
        </>
      ) : (
        <form onSubmit={review} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Price in Sepolia ETH<input name="price" className={inputClass} inputMode="decimal" required defaultValue={formatEther(BigInt(room.listing.price_wei))} /></label>
          <label className="grid gap-1 text-sm">Quantity<input name="quantity" className={inputClass} type="number" required min={1} max={room.listing.quantity} defaultValue={room.listing.quantity} /></label>
          <label className="grid gap-1 text-sm">Buyer character<input name="buyerCharacter" className={inputClass} required maxLength={80} /></label>
          <label className="grid gap-1 text-sm">Seller character<input name="sellerCharacter" className={inputClass} required maxLength={80} /></label>
          <label className="grid gap-1 text-sm">Server or region<input name="region" className={inputClass} required maxLength={80} defaultValue={room.listing.region} /></label>
          <label className="grid min-w-0 gap-1 text-sm">Meeting time (your local time)<input name="meetingTime" className={inputClass} type="datetime-local" required /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Delivery method<input name="deliveryMethod" className={inputClass} required maxLength={240} defaultValue={room.listing.delivery_method} /></label>
          <Button type="submit" className="justify-self-start">Review offer</Button>
        </form>
      )}
      {error && <p role="alert" className="text-destructive wrap-anywhere">{error}</p>}
    </section>
  );
}

function OfferTerms({ offer }: { offer: Offer }) {
  const { feeWei, sellerWei } = splitPayment(offer.signedOffer.amount);
  return (
    <dl className="grid gap-2 text-sm wrap-anywhere">
      <div><dt className="text-muted-foreground">Item</dt><dd>{offer.agreement.title} × {offer.agreement.quantity}</dd></div>
      <div><dt className="text-muted-foreground">Deposit</dt><dd>{formatEther(BigInt(offer.signedOffer.amount))} ETH</dd></div>
      <div><dt className="text-muted-foreground">Platform fee (5%) / Seller receives</dt><dd>{formatEther(BigInt(feeWei))} / {formatEther(BigInt(sellerWei))} ETH</dd></div>
      <div><dt className="text-muted-foreground">Buyer character / Seller character</dt><dd>{offer.agreement.buyerCharacter} / {offer.agreement.sellerCharacter}</dd></div>
      <div><dt className="text-muted-foreground">Region / Delivery method</dt><dd>{offer.agreement.region} / {offer.agreement.deliveryMethod}</dd></div>
      <div><dt className="text-muted-foreground">Meeting time (UTC)</dt><dd>{dateFormat.format(new Date(offer.agreement.meetingTime))}</dd></div>
    </dl>
  );
}

function OfferCard({ offer, room, buyer, context, onFunded, onEvidence }: { offer: Offer; room: Conversation; buyer: boolean; context: OfferContext; onFunded: (offer: Offer) => void; onEvidence: () => void }) {
  const [funding, setFunding] = useState<OrderFunding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [now, setNow] = useState(0);
  const operation = useRef(false);
  const pendingHash = useRef<string | null>(null);
  const storageKey = `notbit-deposit:${offer.chainId}:${offer.escrowAddress}:${offer.id}`;
  const endpoint = `/api/v1/orders/${offer.id}`;

  const check = useCallback(async () => {
    let stored = pendingHash.current;
    try { stored ??= localStorage.getItem(storageKey); } catch { /* Continue checking the on-chain order when storage is unavailable. */ }
    let submissionError: unknown;
    if (stored) {
      try {
        await result(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash: stored }) }));
      } catch (failure) { submissionError = failure; }
    }
    const state = await result<OrderFunding>(await fetch(endpoint, { cache: "no-store" }));
    if (submissionError && state.status !== "CONFIRMED") throw submissionError;
    if (stored) {
      pendingHash.current = null;
      try { localStorage.removeItem(storageKey); } catch { /* The server retains the submitted transaction. */ }
    }
    setFunding(state);
    setError("");
    if (state.status === "CONFIRMED") onFunded(offer);
    return state;
  }, [endpoint, storageKey, onFunded, offer]);

  useEffect(() => {
    let active = true;
    let checking = false;
    async function update() {
      if (!active || checking) return;
      checking = true;
      try { await check(); }
      catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Deposit verification is unavailable."); }
      finally { checking = false; }
    }
    void update();
    const interval = window.setInterval(update, 12000);
    window.addEventListener("focus", update);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", update); };
  }, [check]);

  const confirmed = funding?.status === "CONFIRMED";
  const actionDeadline = confirmed && (funding.orderStatus === "FUNDED" || funding.orderStatus === "DELIVERED")
    ? funding.deadline : null;
  const offerDeadline = !confirmed && offer.status === "OPEN" ? offer.signedOffer.expiresAt : null;
  const deadline = actionDeadline ?? offerDeadline;

  useEffect(() => {
    if (deadline === null) return;
    const deadlineMs = deadline * 1000;
    function tick() {
      const current = Date.now();
      setNow(current);
      if (current >= deadlineMs) window.clearInterval(interval);
    }
    const interval = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(interval);
  }, [deadline]);

  async function deposit() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    let submitted = false;
    try {
      const existing = await check();
      if (existing.status !== "AWAITING_DEPOSIT" && existing.status !== "FAILED") return;
      if (!matchesAgreement(offer, room.listing.id) || offer.signedOffer.buyer !== context.buyer ||
          offer.signedOffer.seller !== context.seller || offer.chainId !== context.chainId || offer.escrowAddress !== context.escrowAddress ||
          !(await verifyTypedData({ ...offerTypedData(offer), address: context.seller, signature: offer.signedOffer.signature }))) {
        throw new Error("The offer signature or agreement is invalid.");
      }
      if (Date.now() >= offer.signedOffer.expiresAt * 1000) throw new Error("This offer has expired. Ask the seller for a new one.");
      setPhase("Waiting for MetaMask…");
      const connector = await requireWallet(context.buyer, offer.chainId);
      const publicClient = publicEscrowClient(offer.chainId);
      const { request } = await publicClient.simulateContract({ account: context.buyer, address: offer.escrowAddress, abi: escrowAbi,
        functionName: "fundOrder", args: [offerTypedData(offer).message, offer.signedOffer.signature], value: BigInt(offer.signedOffer.amount), blockTag: "pending" });
      const hash = await writeContract(walletConfig, {
        account: context.buyer, address: offer.escrowAddress, abi: escrowAbi, functionName: "fundOrder",
        args: [offerTypedData(offer).message, offer.signedOffer.signature], value: BigInt(offer.signedOffer.amount),
        gas: request.gas, chainId: offer.chainId, connector,
      });
      submitted = true;
      pendingHash.current = hash;
      try { localStorage.setItem(storageKey, hash); } catch { /* Submit the hash to the server even if browser storage is full. */ }
      setPhase("Deposit submitted. Waiting for blockchain confirmation…");
      setFunding({ status: "SUBMITTED", hash, confirmations: 0, orderStatus: null, deadline: null });
      await check();
    } catch (failure) {
      setError(submitted ? "The deposit was submitted. Its confirmation is still being checked. Keep the transaction hash from MetaMask." :
        walletErrorMessage(failure));
    } finally { operation.current = false; setBusy(false); }
  }

  const expired = offer.status === "EXPIRED" || (now > 0 && now >= offer.signedOffer.expiresAt * 1000);
  const pending = funding?.status === "SUBMITTED" || funding?.status === "CONFIRMING";
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{confirmed ? "Deposit confirmed" : expired ? "Expired offer" : "Signed offer"}</h3>
      <OfferTerms offer={offer} />
      <p className="text-xs text-muted-foreground wrap-anywhere">Order ID · {offer.id}</p>
      {!confirmed && offer.status !== "FUNDED" && <p className="text-sm text-muted-foreground">Expires {dateFormat.format(new Date(offer.signedOffer.expiresAt * 1000))} UTC</p>}
      {deadline !== null && now > 0 && <p role="timer" className="text-sm tabular-nums">
        {deadline * 1000 <= now ? (actionDeadline === null ? "Offer expired" : "Deadline passed")
          : `${actionDeadline === null ? "Offer expires in" : funding?.orderStatus === "FUNDED" ? "Delivery due in" : "Receipt due in"} ${formatRemainingTime(deadline * 1000 - now)}`}
      </p>}
      <p className="text-xs text-muted-foreground">Character names have not been verified with the game.</p>
      {buyer && !confirmed && <>
        <p className="text-sm">Your deposit is held in escrow. The seller receives 95% after receipt confirmation or an admin decision. Gas is paid separately.</p>
        <Button type="button" disabled={busy || pending || expired || !funding} onClick={deposit}>Deposit {formatEther(BigInt(offer.signedOffer.amount))} ETH</Button>
      </>}
      {confirmed && <>
        <p role="status">{funding.orderStatus} · At least {requiredConfirmations} confirmations.
          {actionDeadline !== null && ` ${funding.orderStatus === "FUNDED" ? "Delivery" : "Receipt"} deadline ${dateFormat.format(new Date(actionDeadline * 1000))} UTC.`}
        </p>
        {!funding.projectionReady && <p role="status" className="text-sm text-muted-foreground">Deposit confirmed. Syncing your order before the next step. You do not need to deposit again.</p>}
        <Button type="button" variant="outline" disabled={!funding.projectionReady} onClick={onEvidence}>View evidence and next action</Button>
      </>}
      {pending && <p role="status">{funding.status === "CONFIRMING" ? `Confirming deposit (${Math.min(funding.confirmations, requiredConfirmations)}/${requiredConfirmations})` : "Deposit submitted. Waiting for confirmation…"}</p>}
      {funding?.status === "FAILED" && <p role="alert">The deposit transaction failed. Check the transaction before retrying.</p>}
      {busy && <p role="status">{phase || "Checking deposit…"}</p>}
      {funding?.hash && <p className="text-xs wrap-anywhere">Transaction · {offer.chainId === 11155111 ? <a className="underline" href={`https://sepolia.etherscan.io/tx/${funding.hash}`} target="_blank" rel="noreferrer">{funding.hash}</a> : funding.hash}</p>}
      {error && <p role="alert" className="text-destructive wrap-anywhere">{error}</p>}
    </section>
  );
}

export function TradeOffers({ room, viewerId, onFunded, onEvidence, initialOfferId }: { room: Conversation; viewerId: string; onFunded: (offer: Offer) => void; onEvidence: () => void; initialOfferId?: string }) {
  const [data, setData] = useState<{ context: OfferContext; offers: Offer[] } | null>(null);
  const [error, setError] = useState("");
  const [funded, setFunded] = useState(false);
  const markFunded = useCallback((offer: Offer) => { setFunded(true); onFunded(offer); }, [onFunded]);
  const refresh = useCallback(async () => {
    const query = initialOfferId ? `?offerId=${initialOfferId}` : "";
    setData(await result(await fetch(`/api/v1/conversations/${room.id}/offers${query}`, { cache: "no-store" })));
    setError("");
  }, [room.id, initialOfferId]);
  useEffect(() => {
    let active = true;
    function sync() { void refresh().catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Could not load offers."); }); }
    sync();
    const config = getSupabaseConfig();
    const db = config ? createBrowserClient(config.url, config.key) : null;
    const channel = db?.channel(`offers:${room.id}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "offers", filter: `conversation_id=eq.${room.id}`,
    }, sync).subscribe();
    const interval = window.setInterval(sync, 15000);
    window.addEventListener("focus", sync);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", sync); if (channel) void db?.removeChannel(channel); };
  }, [refresh, room.id]);
  return (
    <div className="min-w-0 space-y-4">
      {viewerId === room.sellerId && room.listing.status === "ACTIVE" && data && !funded && <OfferForm room={room} context={data.context} onSaved={() => void refresh().catch(() => setError("Refresh to see the saved offer."))} />}
      {data?.offers.map((offer) => <OfferCard key={offer.id} offer={offer} room={room} context={data.context} buyer={viewerId === room.buyerId} onFunded={markFunded} onEvidence={onEvidence} />)}
      {data?.offers.length === 0 && <p className="text-sm text-muted-foreground">No signed offers yet.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
