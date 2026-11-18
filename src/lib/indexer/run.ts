import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi, requiredConfirmations } from "@marketplace/shared";
import { chainFor, createEscrowClient, getEscrowConfig, type EscrowConfig } from "@/lib/chain/config";
import { getServiceSupabase } from "@/lib/supabase/services";
import { findCommonAncestor, nextRange, redactError, safeHead, sameFork, serializeArgs, smallerLogRange, type StoredEvent } from "./plan";

const batchSize = 500n; // Reduced automatically if the RPC plan enforces a smaller range.
const maxBatchesPerRun = 20;
const maxEscalationsPerRun = 5;
const escalationRetryMinutes = 10;

export type IndexerSummary = {
  chainId: number;
  escrowAddress: string;
  head: string;
  checkpoint: string | null;
  inserted: number;
  rewoundTo: string | null;
  escalations: { orderId: string; txHash?: string; error?: string }[];
  stoppedEarly?: string;
};

type Supabase = NonNullable<ReturnType<typeof getServiceSupabase>>;
type Client = ReturnType<typeof createEscrowClient>;

class CheckpointMoved extends Error {}

function rpcError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new CheckpointMoved(error.message);
  throw new Error(`Database error: ${error.message}`);
}

async function loadCheckpoint(supabase: Supabase, config: EscrowConfig) {
  const { data, error } = await supabase.from("chain_checkpoints").select("block_number, block_hash")
    .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).maybeSingle();
  if (error) throw new Error(`Could not read the checkpoint: ${error.message}`);
  return data ? { block: BigInt(data.block_number), hash: String(data.block_hash) } : null;
}

async function blockHash(client: Client, blockNumber: bigint) {
  if (blockNumber < 0n) return null;
  const block = await client.getBlock({ blockNumber }).catch(() => null);
  return block?.hash ?? null;
}

// If the checkpoint block is no longer canonical, rewind to the newest stored block that
// still is, so the next batch re-reads everything after the fork.
async function handleReorg(supabase: Supabase, client: Client, config: EscrowConfig, checkpoint: { block: bigint; hash: string }) {
  const current = await blockHash(client, checkpoint.block);
  if (current === null) throw new Error("The RPC could not return the checkpoint block. Will retry.");
  if (current.toLowerCase() === checkpoint.hash.toLowerCase()) return null;

  const { data, error } = await supabase.from("chain_events").select("block_number, block_hash")
    .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress)
    .lte("block_number", checkpoint.block.toString()).order("block_number", { ascending: false }).limit(64);
  if (error) throw new Error(`Could not read stored blocks: ${error.message}`);
  const ancestor = await findCommonAncestor(data ?? [], (n) => blockHash(client, n));
  const target = ancestor ?? { blockNumber: config.startBlock - 1n, blockHash: null };

  const rewind = await supabase.rpc("indexer_rewind", {
    p_chain_id: config.chainId, p_escrow: config.escrowAddress, p_expected_block: checkpoint.block.toString(),
    p_ancestor_block: target.blockNumber.toString(), p_ancestor_hash: target.blockHash,
  });
  rpcError(rewind.error);
  return target.blockNumber;
}

async function readBatch(client: Client, config: EscrowConfig, from: bigint, to: bigint): Promise<{ events: StoredEvent[]; toHash: string }> {
  const logs = await client.getContractEvents({
    address: config.escrowAddress, abi: escrowAbi, fromBlock: from, toBlock: to, strict: true,
  });
  const numbers = new Set<bigint>([to, ...logs.map((log) => log.blockNumber)]);
  const blocks = new Map<bigint, { hash: string; timestamp: bigint }>();
  for (const number of numbers) {
    const block = await client.getBlock({ blockNumber: number });
    blocks.set(number, { hash: block.hash, timestamp: block.timestamp });
  }
  const hashes = new Map([...blocks].map(([number, block]) => [number, block.hash]));
  if (!sameFork(logs, hashes)) throw new Error("The node returned logs from another fork. Will retry.");

  const events = logs.map((log): StoredEvent => ({
    tx_hash: log.transactionHash.toLowerCase(),
    log_index: log.logIndex,
    block_number: Number(log.blockNumber),
    block_hash: log.blockHash.toLowerCase(),
    block_timestamp: new Date(Number(blocks.get(log.blockNumber)!.timestamp) * 1000).toISOString(),
    event_name: log.eventName,
    payload: serializeArgs(log.args as Record<string, unknown>),
  }));
  return { events, toHash: blocks.get(to)!.hash.toLowerCase() };
}

// Sends escalateExpiredOrder for overdue orders. This only moves them to IN_REVIEW;
// funds stay in escrow until staff decide. Needs a dedicated wallet with Sepolia ETH.
async function escalateExpired(supabase: Supabase, client: Client, config: EscrowConfig) {
  const key = process.env.INDEXER_SENDER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return [];
  const { data: overdue, error } = await supabase.from("orders").select("id, chain_order_id")
    .eq("chain_id", config.chainId).eq("escrow_address", config.escrowAddress).eq("on_chain", true)
    .in("status", ["FUNDED", "DELIVERED"]).lte("deadline", new Date().toISOString())
    .order("deadline").limit(maxEscalationsPerRun * 2);
  if (error || !overdue?.length) return [];

  const ids = overdue.map((order) => order.id);
  const { data: attempts } = await supabase.from("order_escalations").select("order_id, attempts, sent_at").in("order_id", ids);
  const byOrder = new Map((attempts ?? []).map((row) => [row.order_id, row]));
  const retryAfter = Date.now() - escalationRetryMinutes * 60_000;
  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain: chainFor(config.chainId), transport: http(config.rpcUrl) });

  const results: IndexerSummary["escalations"] = [];
  for (const order of overdue) {
    if (results.length >= maxEscalationsPerRun) break;
    const previous = byOrder.get(order.id);
    if (previous && new Date(previous.sent_at).getTime() > retryAfter) continue;
    const record = { order_id: order.id, attempts: (previous?.attempts ?? 0) + 1, sent_at: new Date().toISOString() };
    try {
      const { request } = await client.simulateContract({
        account, address: config.escrowAddress, abi: escrowAbi, functionName: "escalateExpiredOrder",
        args: [order.chain_order_id as Hex],
      });
      const txHash = await wallet.writeContract(request);
      await supabase.from("order_escalations").upsert({ ...record, tx_hash: txHash.toLowerCase(), last_error: null });
      results.push({ orderId: order.id, txHash });
    } catch (cause) {
      const message = redactError(cause);
      await supabase.from("order_escalations").upsert({ ...record, tx_hash: null, last_error: message });
      results.push({ orderId: order.id, error: message });
    }
  }
  return results;
}

export async function runIndexer(): Promise<IndexerSummary> {
  const config = getEscrowConfig();
  const supabase = getServiceSupabase();
  if (!config) throw new Error("Set NEXT_PUBLIC_ESCROW_ADDRESS and an RPC URL to run the indexer.");
  if (!supabase) throw new Error("Set SUPABASE_SECRET_KEY to run the indexer.");
  if (config.chainId !== 31337 && config.startBlock === 0n) {
    throw new Error("Set ESCROW_START_BLOCK to the escrow deploy block before indexing Sepolia.");
  }
  const client = createEscrowClient(config);

  const head = safeHead(await client.getBlockNumber(), requiredConfirmations);
  const summary: IndexerSummary = {
    chainId: config.chainId, escrowAddress: config.escrowAddress, head: head.toString(),
    checkpoint: null, inserted: 0, rewoundTo: null, escalations: [],
  };

  try {
    let checkpoint = await loadCheckpoint(supabase, config);
    if (checkpoint) {
      const rewound = await handleReorg(supabase, client, config, checkpoint);
      if (rewound !== null) {
        summary.rewoundTo = rewound.toString();
        checkpoint = await loadCheckpoint(supabase, config);
      }
    }

    let currentBatchSize = batchSize;
    for (let batch = 0; batch < maxBatchesPerRun; batch++) {
      const range = nextRange(checkpoint?.block ?? null, config.startBlock, head, currentBatchSize);
      if (!range) break;
      let events: StoredEvent[];
      let toHash: string;
      // Retry the same starting block with a smaller range, never skip blocks.
      for (;;) {
        try {
          ({ events, toHash } = await readBatch(client, config, range.from, range.to));
          break;
        } catch (error) {
          const reduced = smallerLogRange(error, range.to - range.from + 1n);
          if (reduced === null) throw error;
          currentBatchSize = reduced;
          range.to = range.from + reduced - 1n;
        }
      }
      const applied = await supabase.rpc("indexer_apply_batch", {
        p_chain_id: config.chainId, p_escrow: config.escrowAddress, p_from_block: range.from.toString(),
        p_to_block: range.to.toString(), p_to_hash: toHash, p_events: events,
      });
      rpcError(applied.error);
      summary.inserted += Number(applied.data ?? 0);
      checkpoint = { block: range.to, hash: toHash };
    }
    summary.checkpoint = checkpoint?.block.toString() ?? null;
  } catch (error) {
    // Another run moved the checkpoint first. It owns this range, so stop quietly.
    if (!(error instanceof CheckpointMoved)) throw error;
    summary.stoppedEarly = "Another indexer run is in progress.";
    return summary;
  }

  summary.escalations = await escalateExpired(supabase, client, config);
  return summary;
}
