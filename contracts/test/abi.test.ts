import assert from "node:assert/strict";
import { test } from "node:test";
import { artifacts } from "hardhat";
import { escrowAbi } from "@marketplace/shared";
import type { Abi, AbiParameter } from "viem";

function describeParameter(parameter: AbiParameter & { indexed?: boolean }): unknown {
  return [
    parameter.name || "",
    parameter.type,
    Boolean(parameter.indexed),
    "components" in parameter ? parameter.components.map(describeParameter) : [],
  ];
}

function describeAbi(abi: Abi) {
  return abi.map((item) => JSON.stringify([
    item.type,
    "name" in item ? item.name : "",
    "stateMutability" in item ? item.stateMutability : "",
    "inputs" in item ? item.inputs.map(describeParameter) : [],
    "outputs" in item ? item.outputs.map(describeParameter) : [],
  ])).sort();
}

test("the shared web ABI matches the Solidity interface", async () => {
  const artifact = await artifacts.readArtifact("IEscrow");
  assert.deepEqual(describeAbi(escrowAbi), describeAbi(artifact.abi as Abi));
});
