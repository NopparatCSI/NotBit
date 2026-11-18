import { expect, it } from "vitest";
import { nextRange, safeHead, smallerLogRange } from "../src/lib/indexer/plan";

it("respects an RPC's advertised block limit without reducing for unrelated failures", () => {
  const error = Object.assign(new Error("JSON is not a valid request object."), {
    details: "Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.",
  });
  expect(smallerLogRange(error, 500n)).toBe(10n);
  expect(smallerLogRange(new Error("block range too wide"), 10n)).toBe(5n);
  expect(smallerLogRange(new Error("block range too wide"), 1n)).toBeNull();
  expect(smallerLogRange(new Error("network timeout"), 500n)).toBeNull();
  expect(smallerLogRange(new Error("Unauthorized API key"), 500n)).toBeNull();
});

it("continues from the committed checkpoint and never indexes unconfirmed blocks", () => {
  const head = safeHead(100n, 3);
  expect(head).toBe(98n);
  expect(nextRange(90n, 1n, head, 10n)).toEqual({ from: 91n, to: 98n });
  expect(nextRange(98n, 1n, head, 10n)).toBeNull();
  expect(nextRange(null, 50n, head, 10n)).toEqual({ from: 50n, to: 59n });
});
