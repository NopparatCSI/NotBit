import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => ({ chain: vi.fn() }));
vi.mock("viem", async importOriginal => ({ ...await importOriginal<typeof import("viem")>(), createPublicClient: () => ({ getChainId: rpc.chain }) }));
import { getCheckedEscrowClient } from "../src/lib/chain/config";
const config = { chainId: 11155111 as const, escrowAddress: "0x1111111111111111111111111111111111111111" as const, rpcUrl: "https://test.invalid", startBlock: 1n };
beforeEach(() => { rpc.chain.mockReset(); });
it("rejects mismatched or failed RPC checks and retries instead of caching failure", async () => {
  rpc.chain.mockResolvedValueOnce(1).mockResolvedValueOnce(11155111);
  await expect(getCheckedEscrowClient(config)).rejects.toThrow("chain could not be verified");
  await expect(getCheckedEscrowClient(config)).resolves.toBeDefined();
  expect(rpc.chain).toHaveBeenCalledTimes(2);
});
it("shares successful chain verification for concurrent clients using the same RPC", async () => {
  rpc.chain.mockResolvedValue(11155111);
  const other = { ...config, rpcUrl: "https://shared.invalid" };
  await Promise.all([getCheckedEscrowClient(other), getCheckedEscrowClient(other)]);
  expect(rpc.chain).toHaveBeenCalledTimes(1);
});
