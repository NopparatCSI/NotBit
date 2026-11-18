"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Address, Hex } from "viem";
import type { ApiResult } from "@marketplace/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { explainTxError, explorerUrl, sendEscrowTransaction, type TxUpdate } from "./staff-transaction";

const statusText: Record<TxUpdate["status"], string> = {
  AWAITING_SIGNATURE: "Waiting for MetaMask…",
  SUBMITTED: "Transaction sent",
  CONFIRMING: "Waiting for 3 confirmations…",
  SUCCEEDED: "Confirmed on-chain. Refresh after the next status update to see the result.",
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
  const [reviewing, setReviewing] = useState(false);
  const [invalid, setInvalid] = useState<"choice" | "reason" | null>(null);
  const formId = useId();
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const busy = preparing || tx.pending || tx.update?.status === "SUCCEEDED";

  async function submit(event: FormEvent) {
    event.preventDefault();
    tx.setError("");
    if (!choice) {
      setInvalid("choice"); tx.setError("Choose refund or release."); firstChoice.current?.focus(); return;
    }
    if (!reason.trim()) {
      setInvalid("reason"); tx.setError("Write the reason for the decision."); reasonInput.current?.focus(); return;
    }
    setInvalid(null);
    if (!reviewing) { setReviewing(true); return; }
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="Decide dispute">
      {reviewing ? <div className="admin-decision-review">
        <p className="admin-eyebrow">REVIEW YOUR DECISION</p>
        <p className="font-semibold">{choice === "refund" ? "Refund buyer" : "Pay seller per the deal"}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{choice === "refund" ? refundText : releaseText}</p>
        <blockquote>{reason.trim()}</blockquote>
        <p className="text-xs leading-relaxed text-muted-foreground">This decision cannot be reversed after confirmation. Gas already spent is not refunded.</p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setReviewing(false); tx.setError(""); }}>Back to editing</Button>
      </div> : <FieldGroup>
        <FieldSet disabled={busy}>
          <FieldLegend>Choose an outcome</FieldLegend>
          <RadioGroup value={choice} onValueChange={value => { setChoice(value as "refund" | "release"); setInvalid(null); tx.setError(""); }} aria-label="Decision outcome" aria-invalid={invalid === "choice"} aria-describedby={invalid === "choice" ? `${formId}-error` : undefined} disabled={busy}>
            <FieldLabel htmlFor={`${formId}-refund`} className="admin-decision-choice">
              <RadioGroupItem ref={firstChoice} id={`${formId}-refund`} value="refund" /><span>Refund buyer<span className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">{refundText}</span></span>
            </FieldLabel>
            <FieldLabel htmlFor={`${formId}-release`} className="admin-decision-choice">
              <RadioGroupItem id={`${formId}-release`} value="release" /><span>Pay seller per the deal<span className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">{releaseText}</span></span>
            </FieldLabel>
          </RadioGroup>
        </FieldSet>
        <Field data-invalid={invalid === "reason"}>
          <FieldLabel htmlFor={`${formId}-reason`}>Reason for this decision</FieldLabel>
          <Textarea ref={reasonInput} id={`${formId}-reason`} value={reason} onChange={event => { setReason(event.target.value); if (invalid === "reason") { setInvalid(null); tx.setError(""); } }} maxLength={2000} rows={5} disabled={busy} required aria-invalid={invalid === "reason"} aria-describedby={`${formId}-hint${invalid === "reason" ? ` ${formId}-error` : ""}`} placeholder="Explain what the evidence shows and why this outcome is appropriate." />
          <FieldDescription id={`${formId}-hint`}>Keep the explanation clear and specific. {reason.length}/2,000 characters.</FieldDescription>
        </Field>
      </FieldGroup>}
      {tx.error && <p id={`${formId}-error`} role="alert" className="text-sm leading-relaxed text-destructive">{tx.error}</p>}
      <Button type="submit" disabled={busy}>{preparing ? "Saving decision…" : tx.pending ? "Waiting for confirmation…" : tx.update?.status === "SUCCEEDED" ? "Decision confirmed" : reviewing ? "Confirm in MetaMask" : "Review decision"}</Button>
      {!reviewing && <p className="text-xs leading-relaxed text-muted-foreground">You can review your choice before signing. Nothing is sent at this step.</p>}
      <TxStatusLine update={tx.update} chainId={chainId} />
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