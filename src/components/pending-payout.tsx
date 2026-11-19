"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { writeContract } from "@wagmi/core";
import { formatEther, parseEventLogs, type Address, type Hex } from "viem";
import { escrowAbi, requiredConfirmations, type ApiResult } from "@marketplace/shared";
import { publicEscrowClient, requireWallet, walletConfig, walletErrorMessage } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
type Payout = { wallet: Address; chainId: 11155111 | 31337; escrowAddress: Address; pendingWei: string };
export function PendingPayout({ wallet }: { wallet: string }) {
  const [payout, setPayout] = useState<Payout | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);
  const pending = useRef<Hex | null>(null);
  const operation = useRef(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/payout", { cache: "no-store" });
    const body: ApiResult<Payout> = await response.json();
    if ("error" in body) throw new Error(body.error.message);
    if (!response.ok || body.data.wallet !== wallet) throw new Error("Could not verify this wallet's queued payment.");
    const data = body.data;
    setPayout(data); setError("");
    const key = `notbit-withdraw:${data.chainId}:${data.escrowAddress}:${wallet}`;
    if (!pending.current) { try { const saved = localStorage.getItem(key); if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved)) { pending.current = saved as Hex; setHash(saved as Hex); } } catch { /* Current tab still tracks its hash. */ } }
    if (!pending.current) return;
    const client = publicEscrowClient(data.chainId);
    const receipt = await client.getTransactionReceipt({ hash: pending.current }).catch(() => null);
    if (!receipt || await client.getBlockNumber({ cacheTime: 0 }) - receipt.blockNumber + 1n < BigInt(requiredConfirmations)) return;
    const matched = parseEventLogs({ abi: escrowAbi, logs: receipt.logs, eventName: "PayoutWithdrawn" }).some(event => event.address.toLowerCase() === data.escrowAddress.toLowerCase() && event.args.recipient.toLowerCase() === wallet);
    if (receipt.status === "success" && !matched) { setError("The transaction has no matching withdrawal. Check it before retrying."); return; }
    setMessage(receipt.status === "success" ? "Withdrawal confirmed. The queued payment was sent to your wallet." : "The withdrawal reverted. Your queued balance remains available.");
    pending.current = null; setHash(null); setReviewing(false);
    try { localStorage.removeItem(key); } catch { /* The chain retains the result. */ }
  }, [wallet]);
  useEffect(() => {
    let active = true, checking = false;
    async function sync() { if (!active || checking) return; checking = true; try { await refresh(); } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Payment verification is unavailable."); } finally { checking = false; } }
    void sync(); const timer = window.setInterval(sync, 12000); window.addEventListener("focus", sync);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [refresh]);
  async function withdraw() {
    if (!payout || operation.current || pending.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const connector = await requireWallet(payout.wallet, payout.chainId);
      const client = publicEscrowClient(payout.chainId);
      const { request } = await client.simulateContract({ account: payout.wallet, address: payout.escrowAddress, abi: escrowAbi, functionName: "withdrawPendingPayout", blockTag: "pending" });
      const tx = await writeContract(walletConfig, { account: payout.wallet, address: payout.escrowAddress, abi: escrowAbi, functionName: "withdrawPendingPayout", gas: request.gas, chainId: payout.chainId, connector });
      pending.current = tx; setHash(tx);
      try { localStorage.setItem(`notbit-withdraw:${payout.chainId}:${payout.escrowAddress}:${wallet}`, tx); } catch { setMessage("Keep this transaction hash from MetaMask until it is confirmed."); }
      await refresh();
    } catch (failure) { setError(pending.current ? "Withdrawal submitted. Verification will continue; do not send it again." : walletErrorMessage(failure)); }
    finally { operation.current = false; setBusy(false); }
  }
  const available = payout && BigInt(payout.pendingWei) > 0n;
  return <Card className="w-full max-w-xl"><CardHeader><CardTitle>Queued payments</CardTitle><CardDescription>Payments that could not be delivered automatically. Only your wallet can withdraw its balance.</CardDescription></CardHeader><CardContent className="flex flex-col items-start gap-3">
    <p role="status">{payout ? `${formatEther(BigInt(payout.pendingWei))} ETH available` : "Checking queued payments…"}</p>
    {hash && <p role="status" className="break-all text-sm">Waiting for 3 confirmations · {payout?.chainId === 11155111 ? <a className="underline" href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a> : hash}</p>}
    {available && !hash && (reviewing ? <><p className="text-sm">Withdraw to your signed-in wallet? You pay the transaction gas. Withdrawals remain available when new deposits are paused.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !!error} onClick={withdraw}>Confirm withdrawal in MetaMask</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReviewing(false)}>Cancel</Button></div></> : <Button type="button" disabled={busy || !!error} onClick={() => setReviewing(true)}>Withdraw queued payment</Button>)}
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </CardContent></Card>;
}
