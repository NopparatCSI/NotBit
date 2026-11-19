import type { Address } from "viem";

export type EscrowSettings = { chainId: 11155111 | 31337; escrowAddress: Address; rpcUrl: string; startBlock: bigint };

// Shared by offer verification, evidence, admin and the indexer. Never send rpcUrl to clients.
export function resolveEscrowSettings(env: Record<string, string | undefined>): EscrowSettings | null {
  const chainId = Number(env.ESCROW_CHAIN_ID || 11155111);
  const address = env.ESCROW_ADDRESS || env.NEXT_PUBLIC_ESCROW_ADDRESS || "";
  const rpcUrl = env.ESCROW_RPC_URL || (chainId === 31337 ? "http://127.0.0.1:8545" : env.SEPOLIA_RPC_URL);
  if ((chainId !== 11155111 && chainId !== 31337) || !/^0x(?!0{40}$)[0-9a-fA-F]{40}$/.test(address) || !rpcUrl) return null;
  try { if (!["http:", "https:"].includes(new URL(rpcUrl).protocol)) return null; } catch { return null; }
  const startBlock = /^[0-9]+$/.test(env.ESCROW_START_BLOCK ?? "") ? BigInt(env.ESCROW_START_BLOCK!) : 0n;
  return { chainId, escrowAddress: address.toLowerCase() as Address, rpcUrl, startBlock };
}
