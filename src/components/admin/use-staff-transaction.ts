"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import type { ApiResult } from "@marketplace/shared";
import type { TxUpdate } from "./staff-transaction";

type Target = { chainId: number; escrowAddress: string; staffWallet: string };
type Saved = Target & { action: string; orderId?: string; paused?: boolean; txHash: Hex };
export function useStaffTransaction(target: Target, action: "DECISION_SUBMITTED" | "ESCALATION_SUBMITTED" | "FUNDING_PAUSE_SUBMITTED", orderId?: string, paused?: boolean) {
  const router = useRouter();
  const [update, setUpdate] = useState<TxUpdate | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [submittedPaused, setSubmittedPaused] = useState<boolean | undefined>(undefined);
  const saved = useRef<Saved | null>(null);
  const key = `notbit-staff:${target.chainId}:${target.escrowAddress.toLowerCase()}:${target.staffWallet.toLowerCase()}:${action}:${orderId ?? "funding"}`;

  async function record(item: Saved) {
    const response = await fetch("/api/v1/admin/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item), signal: AbortSignal.timeout(10000) });
    const body: ApiResult<unknown> = await response.json();
    if (!response.ok || "error" in body) throw new Error("Transaction sent. Activity synchronization is pending and will be retried. Do not send it again.");
  }
  async function submitted(hash: Hex) {
    const item = { ...target, action, orderId, paused, txHash: hash };
    saved.current = item;
    setSubmittedPaused(item.paused);
    try { localStorage.setItem(key, JSON.stringify(item)); }
    catch { setWarning("Keep the transaction hash from MetaMask. Browser storage is unavailable; history synchronization will still be attempted."); }
    try { await record(item); setWarning(""); }
    catch (failure) { setWarning(failure instanceof Error ? failure.message : "Activity synchronization will be retried."); }
  }

  useEffect(() => {
    let active = true, checking = false;
    saved.current = null; setUpdate(null); setWarning(""); setSubmittedPaused(undefined);
    try {
      const item = JSON.parse(localStorage.getItem(key) || "null") as Saved | null;
      if (item && /^0x[0-9a-fA-F]{64}$/.test(item.txHash) && item.action === action && item.chainId === target.chainId && item.escrowAddress.toLowerCase() === target.escrowAddress.toLowerCase() && item.staffWallet.toLowerCase() === target.staffWallet.toLowerCase() && item.orderId === orderId) {
        saved.current = item; setSubmittedPaused(item.paused); setUpdate({ status: "CONFIRMING", hash: item.txHash, message: "Recovered transaction. Checking its recorded result." });
      }
    } catch { /* A corrupt local record never grants permission or changes an order. */ }
    async function sync() {
      const item = saved.current;
      if (!active || checking || !item) return;
      checking = true;
      try {
        await record(item);
        const response = await fetch(`/api/v1/admin/transactions?hash=${item.txHash}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        const body: ApiResult<{ transaction: { status: string } | null }> = await response.json();
        if (!response.ok || "error" in body) throw new Error("Could not check the submitted transaction.");
        if (!active || saved.current !== item) return;
        setWarning("");
        const state = body.data.transaction?.status;
        if (state === "CONFIRMED" || state === "FAILED") {
          setUpdate({ status: state === "CONFIRMED" ? "SUCCEEDED" : "FAILED", hash: item.txHash });
          saved.current = null;
          try { localStorage.removeItem(key); } catch { /* The server retains the verified result. */ }
          router.refresh();
        } else if (state === "ORPHANED" || state === "UNKNOWN") {
          setUpdate({ status: "UNKNOWN", hash: item.txHash, message: "The result is being verified after a chain change. Do not resend." });
        }
      } catch {
        if (active && saved.current === item) { setWarning("Transaction verification or activity synchronization is unavailable. Retrying automatically; do not resend."); setUpdate(current => current?.status === "SUCCEEDED" || current?.status === "FAILED" ? current : { status: "UNKNOWN", hash: item.txHash }); }
      } finally { checking = false; }
    }
    void sync(); const timer = window.setInterval(sync, 12000);
    window.addEventListener("focus", sync);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [key, action, orderId, target.chainId, target.escrowAddress, target.staffWallet, router]);
  return { update, setUpdate, error, setError, warning, submitted, submittedPaused, pending: update !== null && !["SUCCEEDED", "FAILED"].includes(update.status) };
}
