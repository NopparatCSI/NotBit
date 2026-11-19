import { beforeAll, describe, expect, test } from "vitest";
import { login, createDeal, fund, evidence, confirm, client, state, chainOrder, send, index, record, mine } from "./environment";
import { escrowAbi } from "@marketplace/shared";
beforeAll(async () => { await login("buyer"); await login("seller"); });
describe.sequential("19 actual 24/48 hour deadlines on the unchanged local Contract", () => {
  for (const delivered of [false,true]) test(delivered ? "48h after delivery" : "24h after funding", async () => {
    const snapshot = await client.request({ method: "evm_snapshot" as never });
    try {
      const deal = await createDeal(delivered ? "48h" : "24h");
      await fund(deal);
      let previous = await chainOrder(deal);
      const fundingBlock = await client.getBlock();
      expect(Number(previous.deadline) - Number(fundingBlock.timestamp)).toBeGreaterThan(86_300);
      if (delivered) {
        const upload = await evidence("seller", deal, "delivery");
        const hash = await confirm("seller", upload.receipt);
        const receipt = await client.getTransactionReceipt({ hash });
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        previous = await chainOrder(deal);
        expect(Number(previous.deadline) - Number(block.timestamp)).toBe(172800);
      }
      await expect(client.simulateContract({ address: state.escrowAddress, abi: escrowAbi, functionName: "escalateExpiredOrder", args: [deal.offer.signedOffer.orderId], account: state.roles.outsider })).rejects.toThrow();
      // Stop interval mining so the exact boundary can be exercised deterministically.
      await client.request({ method: "evm_setIntervalMining" as never, params: [0] as never });
      await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(previous.deadline)-1] as never });
      await mine(1);
      await expect(client.simulateContract({ address: state.escrowAddress, abi: escrowAbi, functionName: "escalateExpiredOrder", args: [deal.offer.signedOffer.orderId], account: state.roles.outsider, blockTag: "latest" })).rejects.toThrow();
      await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(previous.deadline)] as never });
      await mine(1);
      const before = await client.getBalance({ address: state.escrowAddress });
      await send("outsider", "escalateExpiredOrder", [deal.offer.signedOffer.orderId]);
      await index();
      expect((await chainOrder(deal)).status).toBe(3);
      expect(await client.getBalance({ address: state.escrowAddress })).toBe(before);
      record("19", { passed: true, hours: delivered ? 48 : 24, orderId: deal.offer.id, boundary: previous.deadline });
    } finally {
      const oldHeight = await client.getBlockNumber({ cacheTime: 0 });
      await client.request({ method: "evm_revert" as never, params: [snapshot] as never });
      const height = await client.getBlockNumber({ cacheTime: 0 });
      if (oldHeight >= height) await mine(Number(oldHeight-height)+4);
      await client.request({ method: "evm_setIntervalMining" as never, params: [1000] as never });
      await index();
    }
  });
});
