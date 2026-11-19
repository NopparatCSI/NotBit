import { expect, it } from "vitest";
import { resolveEscrowSettings } from "../src/lib/chain/settings";

const address = "0x1111111111111111111111111111111111111111";
it("selects the same server RPC override for offers and indexing and rejects other chains", () => {
  expect(resolveEscrowSettings({ NEXT_PUBLIC_ESCROW_ADDRESS: address, SEPOLIA_RPC_URL: "https://sepolia.example", ESCROW_RPC_URL: "https://override.example", ESCROW_START_BLOCK: "12" }))
    .toEqual({ chainId: 11155111, escrowAddress: address, rpcUrl: "https://override.example", startBlock: 12n });
  expect(resolveEscrowSettings({ NEXT_PUBLIC_ESCROW_ADDRESS: address, ESCROW_CHAIN_ID: "31337" })?.rpcUrl).toBe("http://127.0.0.1:8545");
  expect(resolveEscrowSettings({ NEXT_PUBLIC_ESCROW_ADDRESS: address, ESCROW_CHAIN_ID: "1", ESCROW_RPC_URL: "https://mainnet.example" })).toBeNull();
  expect(resolveEscrowSettings({ NEXT_PUBLIC_ESCROW_ADDRESS: address, SEPOLIA_RPC_URL: "file:///secret" })).toBeNull();
});
