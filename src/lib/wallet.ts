"use client";

import { connect, createConfig, getAccount, http, injected, switchChain } from "@wagmi/core";
import { hardhat, sepolia } from "viem/chains";
import { BaseError, ContractFunctionRevertedError, createPublicClient, type Address } from "viem";

export const walletConfig = createConfig({
  chains: [sepolia, hardhat],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false,
  transports: { [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined), [hardhat.id]: http("http://127.0.0.1:8545") },
});

export function publicEscrowClient(chainId: 11155111 | 31337) {
  return createPublicClient({
    chain: chainId === 31337 ? hardhat : sepolia,
    transport: http(chainId === 31337 ? "http://127.0.0.1:8545" : process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined),
  });
}

export async function requireWallet(wallet: Address, chainId: 11155111 | 31337) {
  const connector = walletConfig.connectors[0];
  if (!connector || !(await connector.getProvider())) throw new Error("Open this page in a browser with MetaMask installed.");
  const current = getAccount(walletConfig);
  const connection = current.address && current.connector === connector
    ? { accounts: [current.address], chainId: current.chainId }
    : await connect(walletConfig, { connector });
  if (connection.accounts[0]?.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error("Select the MetaMask account used to sign in, then try again.");
  }
  if (connection.chainId !== chainId) await switchChain(walletConfig, { chainId, connector });
  return connector;
}

export function walletErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "The wallet request could not be completed. Please try again.";
  if (!(error instanceof BaseError)) return error.message;
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const messages: Record<string, string> = {
      FundingPaused: "New deposits are currently paused.",
      ListingAlreadyFunded: "Another buyer has already funded this listing.",
      DeadlinePassed: "The time limit for this action has passed. Refresh the order to check its status.",
      InvalidSignature: "The seller signature could not be verified.",
      Unauthorized: "Use the wallet authorized for this order action.",
      InvalidReceipt: "The evidence receipt does not match this action.",
      InvalidOrderState: "The order state has changed. Refresh the order before trying again.",
      NoPendingPayout: "This wallet has no queued payment to withdraw.",
      PayoutFailed: "The withdrawal could not be delivered. The queued balance remains available.",
    };
    return messages[revert.data?.errorName ?? ""] ?? "The contract rejected this action. Refresh the order and check its status.";
  }
  return error.shortMessage;
}
