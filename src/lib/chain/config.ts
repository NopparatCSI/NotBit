import "server-only";
import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { chainIds } from "@marketplace/shared";
import { resolveEscrowSettings, type EscrowSettings } from "./settings";
import { ApiError } from "@/lib/api/response";

export type EscrowConfig = EscrowSettings;

// ESCROW_CHAIN_ID selects Sepolia (default) or the local Hardhat chain for testing.
export function getEscrowConfig(): EscrowConfig | null {
  return resolveEscrowSettings(process.env);
}

export function chainFor(chainId: number) {
  return chainId === chainIds.local ? hardhat : sepolia;
}

export function createEscrowClient(config: EscrowConfig) {
  return createPublicClient({ chain: chainFor(config.chainId), transport: http(config.rpcUrl, { retryCount: 2 }) });
}

const checks = new Map<string, { until: number; promise: Promise<void> }>();
export async function getCheckedEscrowClient(config: EscrowConfig) {
  const client = createEscrowClient(config), key = `${config.chainId}:${config.rpcUrl}`;
  let check = checks.get(key);
  if (!check || check.until <= Date.now()) {
    for (const [oldKey, value] of checks) if (value.until <= Date.now()) checks.delete(oldKey);
    const promise = client.getChainId().then(actual => {
      if (actual !== config.chainId) throw new ApiError(503, "UNAVAILABLE", "The configured RPC is connected to a different chain.");
    }).catch(() => { checks.delete(key); throw new ApiError(503, "UNAVAILABLE", "The escrow RPC chain could not be verified. Check the server configuration."); });
    check = { until: Date.now() + 30_000, promise }; checks.set(key, check);
  }
  await check.promise;
  return client;
}

// The stored order must belong to the escrow this server signs and indexes for.
export function matchesEscrow(config: EscrowConfig, chainId: number, escrowAddress: string) {
  return config.chainId === chainId && config.escrowAddress === escrowAddress.toLowerCase();
}
