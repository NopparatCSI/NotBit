"use client";
import { uploadStagedImage } from "@/lib/uploads/client";

import Image from "next/image";
import { writeContract } from "@wagmi/core";
import { escrowAbi, hashEvidence, requiredConfirmations, type ApiResult } from "@marketplace/shared";
import { parseEventLogs, type Hex } from "viem";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkEvidenceReceipt, disputeEvidenceUploadSchema, evidenceHistorySchema, evidenceUploadSchema, hashEvidenceFiles, type EvidenceRecord, type SignedEvidenceReceipt } from "@/lib/evidence";
import { maxFilesPerUpload } from "@/lib/evidence/files";
import { publicEscrowClient, requireWallet, walletConfig, walletErrorMessage } from "@/lib/wallet";
import type { Offer, OrderFunding } from "@/lib/offers/model";

const orderTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
type PendingAction = { hash: Hex; stage: 0 | 1 | 2 };
const actionDetails = {
  0: { label: "delivery", event: "DeliveryConfirmed", success: "Delivery confirmed on chain." },
  1: { label: "receipt", event: "ReceiptConfirmed", success: "Receipt confirmed on chain. The order has been released." },
  2: { label: "dispute", event: "OrderInReview", success: "Dispute confirmed on chain. Funds remain in escrow while staff review the order." },
} as const;

async function responseData<T>(response: Response, evidence = false): Promise<T> {
  if (evidence && !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Evidence uploads and viewing are currently unavailable. Try again later.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The service returned an unexpected response. Please try again.");
  const result: ApiResult<T> = await response.json();
  if ("error" in result) throw new Error(result.error.message);
  if (!response.ok) throw new Error("The request could not be completed.");
  return result.data;
}

function EvidenceHistory({ orderId, refreshKey }: { orderId: string; refreshKey: number }) {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await responseData<unknown>(await fetch(`/api/v1/orders/${orderId}/evidence`, { cache: "no-store", signal }), true);
    setRecords(evidenceHistorySchema.parse(data).evidence);
    setError("");
  }, [orderId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.name !== "ZodError" ? failure.message : "Could not load evidence history.");
    });
    return () => controller.abort();
  }, [load, refreshKey]);

  async function viewImage(id: string) {
    setLoadingId(id);
    setError("");
    try {
      const data = await responseData<{ url: string }>(await fetch(`/api/v1/orders/${orderId}/evidence/${id}`, { cache: "no-store" }), true);
      const url = new URL(data.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("The evidence link is invalid.");
      setImages((current) => ({ ...current, [id]: url.href }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not open this evidence image."); }
    finally { setLoadingId(null); }
  }

  return (
    <section className="space-y-3" aria-label="Saved evidence">
      <h3 className="font-semibold">Saved evidence</h3>
      {records.length === 0 && !error && <p className="text-sm text-muted-foreground">No evidence images have been saved yet.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {records.map((record) => (
          <li key={record.id} className="space-y-2 rounded-lg border border-border p-3 text-sm wrap-anywhere">
            <p className="font-semibold">{record.stage === "DELIVERY" ? "Delivery evidence" : record.stage === "RECEIPT" ? "Receipt evidence" : "Dispute evidence"}</p>
            <p>{record.submittedBy === "BUYER" ? "Buyer" : "Seller"} · {orderTime.format(new Date(record.createdAt))} UTC</p>
            <p className="text-xs text-muted-foreground">File hash · {record.fileHash}</p>
            {images[record.id] && <a href={images[record.id]} target="_blank" rel="noreferrer">
              <Image unoptimized src={images[record.id]} alt={`${record.stage.toLowerCase()} evidence`} width={520} height={390} className="max-h-64 w-full object-contain" />
            </a>}
            <Button type="button" variant="outline" disabled={loadingId === record.id} onClick={() => viewImage(record.id)}>
              {loadingId === record.id ? "Opening…" : images[record.id] ? "Refresh image link" : "View image"}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" variant="outline" onClick={() => void load().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Could not refresh evidence."))}>Refresh evidence</Button>
    </section>
  );
}

function EvidenceUpload({ offer, buyer, dispute, onSubmitted, disabled }: {
  offer: Offer; buyer: boolean; dispute: boolean; onSubmitted: (pending: PendingAction) => void; disabled: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<SignedEvidenceReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const stage = buyer ? 1 : 0;
  const wallet = buyer ? offer.signedOffer.buyer : offer.signedOffer.seller;
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  async function upload() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const evidenceHash = await hashEvidenceFiles(files);
      const ticketIds: string[] = [];
      for (const file of files) ticketIds.push(await uploadStagedImage(file, "evidence", offer.id));
      const body = JSON.stringify({ stage: dispute ? "dispute" : buyer ? "receipt" : "delivery", ticketIds });
      const data = await responseData<unknown>(await fetch(`/api/v1/orders/${offer.id}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body }), true);
      if (dispute) {
        const parsed = disputeEvidenceUploadSchema.safeParse(data);
        if (!parsed.success || parsed.data.evidence.length !== files.length
          || parsed.data.evidence.some((item) => item.stage !== "DISPUTE")
          || hashEvidence(parsed.data.evidence.map((item) => item.fileHash as Hex)) !== evidenceHash) {
          throw new Error("The evidence service could not verify the saved dispute images.");
        }
        setFiles([]);
      } else {
        const parsed = evidenceUploadSchema.safeParse(data);
        if (!parsed.success) throw new Error("The evidence service returned an invalid signed receipt.");
        checkEvidenceReceipt(parsed.data.receipt, { orderId: offer.signedOffer.orderId, submitter: wallet, stage, evidenceHash });
        setReceipt(parsed.data.receipt);
      }
      setUploaded((value) => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not upload evidence. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function confirm() {
    if (submitting.current || !receipt || (buyer && !acknowledged)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const connector = await requireWallet(wallet, offer.chainId);
      const { signature, ...fields } = receipt;
      const functionName = buyer ? "confirmReceipt" : "confirmDelivery";
      const client = publicEscrowClient(offer.chainId);
      const { request } = await client.simulateContract({
        account: wallet, address: offer.escrowAddress, abi: escrowAbi, functionName, args: [fields, signature], blockTag: "pending",
      });
      const hash = await writeContract(walletConfig, {
        account: wallet, address: offer.escrowAddress, abi: escrowAbi, functionName, args: [fields, signature],
        gas: request.gas, chainId: offer.chainId, connector,
      });
      onSubmitted({ hash, stage });
    } catch (failure) { setError(walletErrorMessage(failure)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{dispute ? "Add dispute evidence" : buyer ? "Receipt evidence" : "Delivery evidence"}</h3>
        <p className="text-sm text-muted-foreground">Attach 1–{maxFilesPerUpload} JPEG, PNG, or WebP images, up to 10 MB each.</p>
        <label className="grid gap-2 text-sm font-semibold">Evidence images
          <input key={dispute ? uploaded : 0} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || disabled} className="w-full min-w-0"
            onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setReceipt(null); setAcknowledged(false); setError(""); }} />
        </label>
        <ul className="grid grid-cols-2 gap-3">
          {files.map((file, index) => <li key={`${index}:${file.name}`} className="min-w-0 text-sm wrap-anywhere">
            {previews[index] && <Image unoptimized src={previews[index]} alt={`Selected evidence ${index + 1}`} width={320} height={240} className="h-32 w-full object-contain" />}
            <p>{file.name}</p>
          </li>)}
        </ul>
        <Button type="button" variant="outline" disabled={busy || disabled || files.length === 0 || !!receipt} onClick={upload}>
          {receipt ? "Evidence saved" : busy ? "Please wait…" : "Upload evidence"}
        </Button>
        {dispute && uploaded > 0 && files.length === 0 && <p role="status" className="text-sm">Dispute evidence saved.</p>}
        {receipt && <>
          <p className="text-sm wrap-anywhere">Evidence hash · {receipt.evidenceHash}</p>
          {buyer && <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4 shrink-0" checked={acknowledged} disabled={busy || disabled} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I received the item. Confirming releases the escrow to the seller and platform. After release, a dispute in this contract cannot recover the payment.</span>
          </label>}
          <Button type="button" disabled={busy || disabled || (buyer && !acknowledged)} onClick={confirm}>
            {busy ? "Waiting for MetaMask…" : buyer ? "Confirm receipt" : "Confirm delivery"}
          </Button>
        </>}
        {error && <p role="alert" className="text-destructive wrap-anywhere">{error}</p>}
      </section>
      <EvidenceHistory orderId={offer.id} refreshKey={uploaded} />
    </div>
  );
}

export function OrderEvidence({ offer, buyer }: { offer: Offer; buyer: boolean }) {
  const [state, setState] = useState<OrderFunding | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const submittingDispute = useRef(false);
  const pendingRef = useRef<PendingAction | null>(null);
  const storageKey = `notbit-evidence:${offer.chainId}:${offer.escrowAddress}:${offer.id}:${buyer ? "buyer" : "seller"}`;
  const wallet = buyer ? offer.signedOffer.buyer : offer.signedOffer.seller;

  const refresh = useCallback(async () => {
    const order = await responseData<OrderFunding>(await fetch(`/api/v1/orders/${offer.id}`, { cache: "no-store" }));
    setState(order);
    setNow(Date.now());
    setError("");
    const action = pendingRef.current;
    if (!action) return;
    const client = publicEscrowClient(offer.chainId);
    const receipt = await client.getTransactionReceipt({ hash: action.hash }).catch(() => null);
    if (!receipt) return;
    const tip = await client.getBlockNumber({ cacheTime: 0 });
    const count = Math.max(0, Number(tip - receipt.blockNumber + 1n));
    setConfirmations(count);
    if (count < requiredConfirmations) return;
    const detail = actionDetails[action.stage];
    const events = parseEventLogs({ abi: escrowAbi, logs: receipt.logs, eventName: detail.event });
    const matched = events.some((event) => event.address.toLowerCase() === offer.escrowAddress.toLowerCase()
      && event.args.orderId === offer.signedOffer.orderId
      && (event.eventName !== "OrderInReview" || (!event.args.expired && event.args.actor?.toLowerCase() === wallet.toLowerCase())));
    if (pendingRef.current !== action) return;
    if (receipt.status !== "success" || !matched) {
      setError("The transaction did not confirm this action. Check its status before retrying.");
    } else {
      setMessage(detail.success);
    }
    pendingRef.current = null;
    setPending(null);
    try { localStorage.removeItem(storageKey); } catch { /* The order state is still read from the chain. */ }
  }, [offer.id, offer.chainId, offer.escrowAddress, offer.signedOffer.orderId, storageKey, wallet]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved.hash) && (saved.stage === (buyer ? 1 : 0) || saved.stage === 2)) {
        pendingRef.current = saved;
        setPending(saved);
      }
    } catch { /* An unavailable or invalid saved entry does not change the on-chain order. */ }
    let active = true;
    let checking = false;
    async function sync() {
      if (!active || checking) return;
      checking = true;
      try { await refresh(); }
      catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Could not check the order state."); }
      finally { checking = false; }
    }
    void sync();
    const interval = window.setInterval(sync, 12000);
    window.addEventListener("focus", sync);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", sync); };
  }, [refresh, storageKey, buyer]);

  function submitted(action: PendingAction) {
    pendingRef.current = action;
    setPending(action);
    setMessage("");
    setConfirmations(0);
    try { localStorage.setItem(storageKey, JSON.stringify(action)); } catch { /* The current tab continues tracking the transaction. */ }
    void refresh().catch(() => setError("The transaction was submitted. Verification is still pending."));
  }

  async function openDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = disputeReason.trim();
    if (!reason || submittingDispute.current || pendingRef.current) return;
    submittingDispute.current = true;
    setDisputeBusy(true);
    setDisputeError("");
    try {
      const connector = await requireWallet(wallet, offer.chainId);
      const call = { account: wallet, address: offer.escrowAddress, abi: escrowAbi,
        functionName: "openDispute", args: [offer.signedOffer.orderId] } as const;
      const client = publicEscrowClient(offer.chainId);
      const { request } = await client.simulateContract({ ...call, blockTag: "pending" });
      const draft = await responseData<{ requiresTransaction: boolean }>(await fetch(`/api/v1/orders/${offer.id}/dispute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      }));
      if (draft.requiresTransaction) {
        const hash = await writeContract(walletConfig, { ...call, gas: request.gas, chainId: offer.chainId, connector });
        submitted({ hash, stage: 2 });
      }
      setShowDispute(false);
    } catch (failure) {
      setDisputeError(walletErrorMessage(failure));
    } finally {
      submittingDispute.current = false;
      setDisputeBusy(false);
    }
  }

  const expired = !!state?.deadline && now >= state.deadline * 1000;
  const ready = state?.status === "CONFIRMED" && state.projectionReady === true;
  const canAct = ready && (buyer ? state.orderStatus === "DELIVERED" : state.orderStatus === "FUNDED") && !expired;
  const canAddDisputeEvidence = ready && state.orderStatus === "IN_REVIEW";
  const canOpenDispute = ready && (state.orderStatus === "FUNDED" || state.orderStatus === "DELIVERED");
  const completed = state?.orderStatus === "RELEASED" || state?.orderStatus === "REFUNDED";
  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label={`Evidence for ${offer.agreement.title}`}>
      <h2 className="text-xl font-semibold wrap-anywhere">{offer.agreement.title}</h2>
      <p className="text-xs text-muted-foreground wrap-anywhere">Order ID · {offer.id}</p>
      <p role="status">{state ? state.orderStatus ?? "Checking deposit confirmation…" : "Checking order…"}</p>
      {state?.deadline && !completed && <p className="text-sm">{state.orderStatus === "DELIVERED" ? "Receipt" : "Delivery"} deadline · {orderTime.format(new Date(state.deadline * 1000))} UTC</p>}
      {expired && !completed && state?.orderStatus !== "IN_REVIEW" && <p>This order is past its deadline and requires admin review. Funds remain in escrow.</p>}
      {state?.orderStatus === "IN_REVIEW" && <p>This order is under admin review.</p>}
      {state?.orderStatus === "FUNDED" && buyer && !expired && <p>Waiting for the seller to confirm delivery.</p>}
      {state?.orderStatus === "DELIVERED" && !buyer && !expired && <p>Delivery is confirmed. Waiting for the buyer to confirm receipt.</p>}
      {state?.orderStatus === "RELEASED" && <p>The order has been released. Settlement is recorded on chain.</p>}
      {state?.orderStatus === "REFUNDED" && <p>The order has been refunded.</p>}
      {pending && <div className="space-y-2">
        <p role="status">Confirming {actionDetails[pending.stage].label} ({Math.min(confirmations, requiredConfirmations)}/{requiredConfirmations})</p>
        <p className="text-sm wrap-anywhere">Transaction · {offer.chainId === 11155111 ? <a className="underline" href={`https://sepolia.etherscan.io/tx/${pending.hash}`} target="_blank" rel="noreferrer">{pending.hash}</a> : pending.hash}</p>
      </div>}
      {canAct || canAddDisputeEvidence ? <EvidenceUpload key={state?.orderStatus} offer={offer} buyer={buyer} dispute={canAddDisputeEvidence} disabled={!!pending || (canAct && showDispute)} onSubmitted={submitted} /> :
        ready ? <EvidenceHistory orderId={offer.id} refreshKey={0} /> : <p role="status" className="text-sm text-muted-foreground">{state?.status === "CONFIRMED" ? "Deposit confirmed. Syncing your order before evidence is available. You do not need to deposit again." : "Evidence will be available after the deposit is confirmed and your order is ready."}</p>}
      {canOpenDispute && !pending && (showDispute ? (
        <form onSubmit={openDispute} className="space-y-3 rounded-lg border border-border p-4" aria-label="Open dispute">
          <label className="grid gap-2 text-sm font-semibold">Dispute reason
            <textarea required maxLength={2000} rows={4} value={disputeReason} disabled={disputeBusy}
              onChange={(event) => setDisputeReason(event.target.value)} className="w-full rounded-lg border border-border bg-background p-2" />
          </label>
          <p className="text-sm text-muted-foreground">Once confirmed, staff will review the order and the funds will stay in escrow.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={disputeBusy || !disputeReason.trim()}>{disputeBusy ? "Waiting for MetaMask…" : "Confirm dispute"}</Button>
            <Button type="button" variant="outline" disabled={disputeBusy} onClick={() => setShowDispute(false)}>Cancel</Button>
          </div>
          {disputeError && <p role="alert" className="text-destructive wrap-anywhere">{disputeError}</p>}
        </form>
      ) : <Button type="button" variant="outline" onClick={() => setShowDispute(true)}>Open dispute</Button>)}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="text-destructive wrap-anywhere">{error}</p>}
    </section>
  );
}
