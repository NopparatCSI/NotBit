"use client";

import {
  connect, createConfig, getAccount, http, injected, simulateContract, switchChain, waitForTransactionReceipt, writeContract,
} from "@wagmi/core";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Address, type Hex } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { escrowAbi, requiredConfirmations, type TransactionStatus } from "@marketplace/shared";

// Staff send their own transactions. The contract checks admin() / superAdmin() itself.
export const staffWalletConfig = createConfig({
  chains: [sepolia, hardhat],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined),
    [hardhat.id]: http(),
  },
});

export type EscrowCall =
  | { functionName: "resolveDispute"; args: readonly [Hex, boolean, Hex] }
  | { functionName: "escalateExpiredOrder"; args: readonly [Hex] }
  | { functionName: "setFundingPaused"; args: readonly [boolean] };

export type TxUpdate = { status: TransactionStatus; hash?: Hex; message?: string };

class TxSetupError extends Error {}

const revertMessages: Record<string, string> = {
  Unauthorized: "This wallet does not have this permission on the escrow contract.",
  InvalidOrderState: "The order is no longer in a state that allows this. Refresh the page.",
  InvalidDecision: "The decision hash is missing. Prepare the decision again.",
  DeadlineNotPassed: "The deadline has not passed on-chain yet. Try again in a few minutes.",
};

export function explainTxError(error: unknown) {
  if (error instanceof TxSetupError) return error.message;
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) return "You rejected the request in MetaMask.";
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && revertMessages[name]) return revertMessages[name];
      if (name) return `The contract rejected the transaction (${name}).`;
    }
    if (/insufficient funds/i.test(error.message)) return "This wallet does not have enough Sepolia ETH for gas.";
  }
  return "The transaction could not be completed. Check MetaMask and try again.";
}

export function explorerUrl(chainId: number, hash: Hex) {
  return chainId === sepolia.id ? `https://sepolia.etherscan.io/tx/${hash}` : null;
}

// Connects the staff wallet, simulates, sends, and waits for 3 confirmations.
// A transaction hash alone is never reported as success.
export async function sendEscrowTransaction(input: {
  chainId: number;
  escrowAddress: Address;
  staffWallet: string;
  call: EscrowCall;
  onUpdate: (update: TxUpdate) => void;
  onSubmitted?: (hash: Hex) => Promise<void> | void;
}) {
  const connector = staffWalletConfig.connectors[0];
  if (!connector || !(await connector.getProvider().catch(() => null))) {
    throw new TxSetupError("Open this page in a browser with MetaMask installed.");
  }
  const chainId = input.chainId as typeof sepolia.id | typeof hardhat.id;
  input.onUpdate({ status: "AWAITING_SIGNATURE" });

  const current = getAccount(staffWalletConfig);
  const connection = current.address && current.connector === connector
    ? { accounts: [current.address], chainId: current.chainId }
    : await connect(staffWalletConfig, { connector });
  const account = connection.accounts[0];
  if (!account || account.toLowerCase() !== input.staffWallet.toLowerCase()) {
    throw new TxSetupError(`Switch MetaMask to your staff wallet ${input.staffWallet} and try again.`);
  }
  if (connection.chainId !== chainId) await switchChain(staffWalletConfig, { chainId, connector });

  const base = { address: input.escrowAddress, abi: escrowAbi, account, chainId, connector } as const;
  let hash: Hex;
  switch (input.call.functionName) {
    case "resolveDispute": {
      const { request } = await simulateContract(staffWalletConfig, { ...base, functionName: "resolveDispute", args: input.call.args });
      hash = await writeContract(staffWalletConfig, request);
      break;
    }
    case "escalateExpiredOrder": {
      const { request } = await simulateContract(staffWalletConfig, { ...base, functionName: "escalateExpiredOrder", args: input.call.args });
      hash = await writeContract(staffWalletConfig, request);
      break;
    }
    case "setFundingPaused": {
      const { request } = await simulateContract(staffWalletConfig, { ...base, functionName: "setFundingPaused", args: input.call.args });
      hash = await writeContract(staffWalletConfig, request);
      break;
    }
  }

  input.onUpdate({ status: "SUBMITTED", hash });
  await input.onSubmitted?.(hash);
  input.onUpdate({ status: "CONFIRMING", hash });
  const receipt = await waitForTransactionReceipt(staffWalletConfig, {
    hash, chainId, confirmations: requiredConfirmations,
  });
  if (receipt.status !== "success") {
    input.onUpdate({ status: "FAILED", hash, message: "The transaction reverted on-chain." });
    return hash;
  }
  input.onUpdate({ status: "SUCCEEDED", hash });
  return hash;
}