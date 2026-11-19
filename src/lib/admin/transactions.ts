import "server-only";
import { decodeFunctionData, type Hex } from "viem";
import { escrowAbi, requiredConfirmations, type Viewer } from "@marketplace/shared";
import { ApiError } from "@/lib/api/response";
import { getCheckedEscrowClient, getEscrowConfig } from "@/lib/chain/config";
import { loadOrder, requireService } from "@/lib/orders/context";

export async function recordStaffTransaction(staff: Viewer, input: { action: string; txHash: Hex; orderId?: string; paused?: boolean }) {
  const config = getEscrowConfig();
  if (!config) throw new ApiError(503, "UNAVAILABLE", "Escrow is unavailable.");
  const client = await getCheckedEscrowClient(config), db = requireService();
  const tx = await client.getTransaction({ hash: input.txHash }).catch(() => null);
  if (!tx) throw new ApiError(503, "UNAVAILABLE", "The submitted transaction is not available yet. It will be checked again.");
  if (tx.from.toLowerCase() !== staff.wallet || tx.to?.toLowerCase() !== config.escrowAddress) throw new ApiError(400, "INVALID_INPUT", "This transaction does not belong to your staff wallet and escrow.");
  let call;
  try { call = decodeFunctionData({ abi: escrowAbi, data: tx.input }); } catch { throw new ApiError(400, "INVALID_INPUT", "Invalid escrow transaction."); }
  const kind = input.action.replace(/_SUBMITTED$/, "");
  const payload: Record<string, unknown> = { chainId: config.chainId, escrowAddress: config.escrowAddress, txHash: input.txHash, wallet: staff.wallet, role: staff.role };
  let orderId: string | null = null;
  if (kind === "FUNDING_PAUSE") {
    if (staff.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only Super Admin can change funding.");
    if (call.functionName !== "setFundingPaused" || call.args[0] !== input.paused) throw new ApiError(400, "INVALID_INPUT", "The transaction does not match this funding change.");
    payload.paused = input.paused;
  } else {
    const order = await loadOrder(input.orderId!);
    const fn = kind === "DECISION" ? "resolveDispute" : "escalateExpiredOrder";
    if (order.chain_id !== config.chainId || order.escrow_address !== config.escrowAddress || call.functionName !== fn || !call.args || call.args[0] !== order.chain_order_id) throw new ApiError(400, "INVALID_INPUT", "The transaction does not match this order action.");
    orderId = order.id;
  }
  const saved = await db.from("staff_transactions").upsert({ chain_id: config.chainId, escrow_address: config.escrowAddress, tx_hash: input.txHash, staff_id: staff.id, staff_wallet: staff.wallet, order_id: orderId, action: kind, payload }, { onConflict: "chain_id,escrow_address,tx_hash", ignoreDuplicates: true });
  if (saved.error) throw new ApiError(503, "UNAVAILABLE", "Could not save the submitted transaction. Its hash will be retried.");
  const audit = await db.from("audit_logs").upsert({ staff_id: staff.id, order_id: orderId, action: input.action, details: payload,
    dedupe_key: `${config.chainId}:${config.escrowAddress}:${input.txHash}:${staff.id}:${input.action}` }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (audit.error) throw new ApiError(503, "UNAVAILABLE", "The transaction is saved. Its activity entry will be retried.");
}

export async function reconcileStaffTransactions() {
  const config = getEscrowConfig(); if (!config) return;
  const db = requireService(), client = await getCheckedEscrowClient(config);
  // Older indexed pause events did not include the transaction sender.
  const missing = await db.from("chain_events").select("tx_hash,log_index,block_hash,payload").eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).eq("event_name", "FundingPauseChanged").is("payload->>actor", null).limit(10);
  for (const e of missing.data ?? []) {
    const tx = await client.getTransaction({ hash: e.tx_hash }).catch(() => null);
    if (tx?.to?.toLowerCase() === config.escrowAddress) await db.from("chain_events").update({ payload: { ...e.payload, actor: tx.from.toLowerCase() } }).eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).eq("tx_hash", e.tx_hash).eq("log_index", e.log_index).eq("block_hash", e.block_hash);
  }
  const reconciled = await db.rpc("reconcile_staff_activity", { p_chain: config.chainId, p_escrow: config.escrowAddress });
  if (reconciled.error) throw new Error("Staff activity reconciliation is unavailable.");
  const pending = await db.from("staff_transactions").select("*").eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).in("status", ["SUBMITTED", "UNKNOWN", "ORPHANED"]).order("updated_at").limit(10);
  const tip = await client.getBlockNumber();
  for (const item of pending.data ?? []) {
    let receipt;
    try { receipt = await client.getTransactionReceipt({ hash: item.tx_hash }); } catch { continue; }
    if (tip - receipt.blockNumber + 1n < BigInt(requiredConfirmations)) continue;
    if (receipt.status === "reverted") {
      const result = await db.rpc("mark_staff_transaction_failed", { p_chain: config.chainId, p_escrow: config.escrowAddress, p_hash: item.tx_hash });
      if (result.error) throw new Error("Could not reconcile the failed transaction and its audit entry.");
    }
  }
}
