import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { chainIds, walletSchema } from "@marketplace/shared";

export type EscrowConfig = {
  chainId: number;
  escrowAddress: Address;
  rpcUrl: string;
  startBlock: bigint;
};

// ESCROW_CHAIN_ID selects Sepolia (default) or the local Hardhat chain for testing.
export function getEscrowConfig(): EscrowConfig | null {
  const chainId = Number(process.env.ESCROW_CHAIN_ID || chainIds.sepolia);
  if (chainId !== chainIds.sepolia && chainId !== chainIds.local) return null;
  const escrow = walletSchema.safeParse(process.env.NEXT_PUBLIC_ESCROW_ADDRESS);
  const rpcUrl = process.env.ESCROW_RPC_URL
    || (chainId === chainIds.local ? "http://127.0.0.1:8545" : process.env.SEPOLIA_RPC_URL);
  if (!escrow.success || !rpcUrl) return null;
  const startBlock = /^[0-9]+$/.test(process.env.ESCROW_START_BLOCK ?? "") ? BigInt(process.env.ESCROW_START_BLOCK!) : 0n;
  return { chainId, escrowAddress: escrow.data, rpcUrl, startBlock };
}

export function chainFor(chainId: number) {
  return chainId === chainIds.local ? hardhat : sepolia;
}

export function createEscrowClient(config: EscrowConfig) {
  return createPublicClient({ chain: chainFor(config.chainId), transport: http(config.rpcUrl, { retryCount: 2 }) });
}

// The stored order must belong to the escrow this server signs and indexes for.
export function matchesEscrow(config: EscrowConfig, chainId: number, escrowAddress: string) {
  return config.chainId === chainId && config.escrowAddress === escrowAddress.toLowerCase();
}