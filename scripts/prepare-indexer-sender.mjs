import nextEnv from "@next/env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

nextEnv.loadEnvConfig(process.cwd(), true);
try {
  const client = createPublicClient({ chain: sepolia, transport: http(process.env.ESCROW_RPC_URL || process.env.SEPOLIA_RPC_URL) });
  if (Number(process.env.ESCROW_CHAIN_ID || 11155111) !== sepolia.id || await client.getChainId() !== sepolia.id) throw new Error();
  let key = process.env.INDEXER_SENDER_PRIVATE_KEY;
  if (!key) {
    key = generatePrivateKey();
    appendFileSync(".env.local", `\n# Dedicated Sepolia-only automated escalation sender\nINDEXER_SENDER_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
    console.log("Created a dedicated sender key in ignored .env.local.");
  }
  const sender = privateKeyToAccount(key);
  console.log(`Escalation sender: ${sender.address}`);
  let balance = await client.getBalance({ address: sender.address });
  if (process.argv.includes("--fund") && balance < parseEther("0.0005")) {
    const path = ".runtime/indexer-sender-funding.json";
    let hash;
    if (existsSync(path)) {
      const previous = JSON.parse(readFileSync(path, "utf8"));
      if (previous.recipient === sender.address) hash = previous.hash;
    }
    if (!hash) {
      const deployer = privateKeyToAccount(process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY);
      const value = parseEther("0.001");
      const fees = await client.estimateFeesPerGas();
      const gas = await client.estimateGas({ account: deployer.address, to: sender.address, value });
      if (await client.getBalance({ address: deployer.address }) < value + gas * fees.maxFeePerGas) throw new Error();
      const wallet = createWalletClient({ account: deployer, chain: sepolia, transport: http(process.env.ESCROW_RPC_URL || process.env.SEPOLIA_RPC_URL) });
      hash = await wallet.sendTransaction({ to: sender.address, value, gas, ...fees });
      mkdirSync(".runtime", { recursive: true });
      writeFileSync(path, JSON.stringify({ recipient: sender.address, hash }));
    }
    console.log(`Sepolia gas funding transaction: ${hash}`);
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 3 });
    if (receipt.status !== "success") throw new Error();
    balance = await client.getBalance({ address: sender.address });
  }
  console.log(`Sender balance: ${balance} wei`);
  if (balance === 0n) { console.log("Sender needs Sepolia ETH before automated escalation."); process.exitCode = 1; }
} catch { console.error("Could not prepare Sepolia sender. Check RPC, key format and gas funds; no private values were printed."); process.exitCode = 1; }
