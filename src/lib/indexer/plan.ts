// Pure indexer helpers with no server or RPC imports, so they are unit-testable.

export type StoredEvent = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  block_hash: string;
  block_timestamp: string;
  event_name: string;
  payload: Record<string, string | boolean>;
};

// JSON-safe payload: wei and timestamps as decimal strings, hex values lowercased.
export function serializeArgs(args: Record<string, unknown>) {
  const payload: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "bigint") payload[key] = value.toString();
    else if (typeof value === "number") payload[key] = String(value);
    else if (typeof value === "string") payload[key] = value.toLowerCase();
    else if (typeof value === "boolean") payload[key] = value;
    else throw new Error(`Unsupported event argument ${key}`);
  }
  return payload;
}

// Only index blocks with at least `confirmations` confirmations (the head block counts as 1).
export function safeHead(latest: bigint, confirmations: number) {
  return latest - BigInt(Math.max(confirmations, 1) - 1);
}

export function nextRange(checkpoint: bigint | null, startBlock: bigint, head: bigint, batchSize: bigint) {
  const from = checkpoint === null ? startBlock : checkpoint + 1n;
  if (from > head) return null;
  const to = from + batchSize - 1n < head ? from + batchSize - 1n : head;
  return { from, to };
}

// Providers can restrict eth_getLogs by plan. Reduce only for explicit range/result
// limits; network/auth errors must leave the checkpoint unchanged and surface.
export function smallerLogRange(error: unknown, current: bigint): bigint | null {
  if (current <= 1n || !(error instanceof Error)) return null;
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const message = `${details} ${error.message}`;
  const advertised = message.match(/up to (?:a )?(\d+) block range/i);
  if (advertised) {
    const limit = BigInt(advertised[1]);
    return limit > 0n && limit < current ? limit : null;
  }
  return /block range|too many results|query returned more than|response size exceeded/i.test(message)
    ? current / 2n : null;
}

// Walk stored blocks from newest to oldest and return the first whose hash still matches
// the chain. Null means nothing stored is canonical, so the caller rewinds fully.
export async function findCommonAncestor(
  stored: readonly { block_number: number; block_hash: string }[],
  hashAt: (blockNumber: bigint) => Promise<string | null>,
) {
  const sorted = [...stored].sort((a, b) => b.block_number - a.block_number);
  for (const block of sorted) {
    const hash = await hashAt(BigInt(block.block_number));
    if (hash && hash.toLowerCase() === block.block_hash.toLowerCase()) {
      return { blockNumber: BigInt(block.block_number), blockHash: block.block_hash.toLowerCase() };
    }
  }
  return null;
}

// Logs from one block must agree on its hash, or the node switched forks mid-read.
export function sameFork(logs: readonly { blockNumber: bigint; blockHash: string }[], hashes: Map<bigint, string>) {
  return logs.every((log) => hashes.get(log.blockNumber)?.toLowerCase() === log.blockHash.toLowerCase());
}

// RPC errors can include the provider URL with its API key. Strip URLs before storing.
export function redactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(https?|wss?):\/\/\S+/gi, "[url]").slice(0, 300);
}
