"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Address, Hex } from "viem";
import type { ApiResult } from "@marketplace/shared";
import { Button } from "@/components/ui/button";
import { explainTxError, explorerUrl, sendEscrowTransaction, type TxUpdate } from "./staff-transaction";

const statusText: Record<TxUpdate["status"], string> = {
  AWAITING_SIGNATURE: "Waiting for MetaMask…",
  SUBMITTED: "Transaction sent",
  CONFIRMING: "Waiting for 3 confirmations…",
  SUCCEEDED: "Confirmed on-chain. The page updates after the next indexer run (about 1 minute).",
  FAILED: "Transaction failed",
};

type ChainTarget = { chainId: number; escrowAddress: string; staffWallet: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!result || "error" in result) throw new Error(result?.error.message ?? "The server could not be reached.");
  return result.data;
}

async function recordActivity(body: Record<string, unknown>): Promise<void> {
  // History is best effort here. The indexer still records the on-chain result.
  await postJson("/api/v1/admin/activity", body).catch(() => undefined);
}

function TxStatusLine({ update, chainId }: { update: TxUpdate | null; chainId: number }) {
  if (!update) return null;
  const link = update.hash ? explorerUrl(chainId, update.hash) : null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {statusText[update.status]}
      {update.message ? ` — ${update.message}` : ""}
      {update.hash && (link
        ? <> · <a className="underline" href={link} target="_blank" rel="noreferrer">View on Etherscan</a></>
        : <span className="font-mono break-all"> · {update.hash}</span>)}
    </p>
  );
}

function useTransaction() {
  const [update, setUpdate] = useState<TxUpdate | null>(null);
  const [error, setError] = useState("");
  const pending = update !== null && !["SUCCEEDED", "FAILED"].includes(update.status);
  return { update, setUpdate, error, setError, pending };
}

export function DecisionForm({ orderId, chainId, escrowAddress, staffWallet, refundText, releaseText }: ChainTarget & {
  orderId: string; refundText: string; releaseText: string;
}) {
  const router = useRouter();
  const tx = useTransaction();
  const [choice, setChoice] = useState<"refund" | "release" | "">("");
  const [reason, setReason] = useState("");
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || tx.pending || tx.update?.status === "SUCCEEDED";

  async function submit(event: FormEvent) {
    event.preventDefault();
    tx.setError("");
    if (!choice) return tx.setError("Choose refund or release.");
    if (!reason.trim()) return tx.setError("Write the reason for the decision.");
    setPreparing(true);
    let draft: { chainOrderId: Hex; refundBuyer: boolean; decisionHash: Hex };
    try {
      draft = await postJson(`/api/v1/admin/orders/${orderId}/decision`, { refundBuyer: choice === "refund", reason });
    } catch (error) {
      tx.setError(error instanceof Error ? error.message : "Could not save the decision.");
      return;
    } finally {
      setPreparing(false);
    }
    try {
      await sendEscrowTransaction({
        chainId, escrowAddress: escrowAddress as Address, staffWallet,
        call: { functionName: "resolveDispute", args: [draft.chainOrderId, draft.refundBuyer, draft.decisionHash] },
        onUpdate: tx.setUpdate,
        onSubmitted: (txHash) => recordActivity({ action: "DECISION_SUBMITTED", orderId, txHash }),
      });
      router.refresh();
    } catch (error) {
      tx.setError(explainTxError(error));
      // Keep the hash visible if one was sent, so staff can check it before retrying.
      tx.setUpdate((current) => (current?.hash ? { ...current, status: "FAILED" } : null));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Decide dispute">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 font-semibold">Decision</legend>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input type="radio" name="decision" value="refund" checked={choice === "refund"}
            onChange={() => setChoice("refund")} className="mt-1" />
          <span><span className="font-semibold">Refund buyer</span>
            <span className="block text-sm text-muted-foreground">{refundText}</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input type="radio" name="decision" value="release" checked={choice === "release"}
            onChange={() => setChoice("release")} className="mt-1" />
          <span><span className="font-semibold">Pay seller per the deal</span>
            <span className="block text-sm text-muted-foreground">{releaseText}</span></span>
        </label>
      </fieldset>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Reason</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={4}
          disabled={busy} required
          className="rounded-lg border border-[var(--input-border)] bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
        <span className="text-xs text-muted-foreground">The reason is stored with its hash. The hash goes on-chain with the decision.</span>
      </label>
      <p className="text-sm text-muted-foreground">Each order can be decided once. After the transaction confirms, the funds move and cannot be reversed here.</p>
      <div><Button type="submit" disabled={busy}>{preparing ? "Saving decision…" : "Sign decision with MetaMask"}</Button></div>
      <TxStatusLine update={tx.update} chainId={chainId} />
      {tx.error && <p role="alert" className="text-sm text-destructive">{tx.error}</p>}
    </form>
  );
}

export function EscalateButton({ orderId, chainOrderId, chainId, escrowAddress, staffWallet }: ChainTarget & {
  orderId: string; chainOrderId: string;
}) {
  const router = useRouter();
  const tx = useTransaction();
  async function escalate() {
    tx.setError("");
    try {
      await sendEscrowTransaction({
        chainId, escrowAddress: escrowAddress as Address, staffWallet,
        call: { functionName: "escalateExpiredOrder", args: [chainOrderId as Hex] },
        onUpdate: tx.setUpdate,
        onSubmitted: (txHash) => recordActivity({ action: "ESCALATION_SUBMITTED", orderId, txHash }),
      });
      router.refresh();
    } catch (error) {
      tx.setError(explainTxError(error));
      tx.setUpdate(null);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" onClick={escalate} disabled={tx.pending || tx.update?.status === "SUCCEEDED"}>
        Move to review
      </Button>
      <TxStatusLine update={tx.update} chainId={chainId} />
      {tx.error && <p role="alert" className="text-sm text-destructive">{tx.error}</p>}
    </div>
  );
}

export function FundingPauseToggle({ paused, chainId, escrowAddress, staffWallet }: ChainTarget & { paused: boolean }) {
  const router = useRouter();
  const tx = useTransaction();
  const [confirming, setConfirming] = useState(false);
  async function toggle() {
    tx.setError("");
    setConfirming(false);
    try {
      await sendEscrowTransaction({
        chainId, escrowAddress: escrowAddress as Address, staffWallet,
        call: { functionName: "setFundingPaused", args: [!paused] },
        onUpdate: tx.setUpdate,
        onSubmitted: (txHash) => recordActivity({ action: "FUNDING_PAUSE_SUBMITTED", paused: !paused, txHash }),
      });
      router.refresh();
    } catch (error) {
      tx.setError(explainTxError(error));
      tx.setUpdate(null);
    }
  }
  const busy = tx.pending || tx.update?.status === "SUCCEEDED";
  return (
    <div className="flex flex-col items-start gap-3">
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            {paused
              ? "Resume new deposits? Buyers can fund offers again."
              : "Pause new deposits? Existing orders keep working: delivery, receipt, disputes, decisions, and payout withdrawals."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={toggle} disabled={busy}>{paused ? "Resume deposits" : "Pause deposits"}</Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant={paused ? "default" : "outline"} onClick={() => setConfirming(true)} disabled={busy}>
          {paused ? "Resume new deposits…" : "Pause new deposits…"}
        </Button>
      )}
      <TxStatusLine update={tx.update} chainId={chainId} />
      {tx.error && <p role="alert" className="text-sm text-destructive">{tx.error}</p>}
    </div>
  );
}