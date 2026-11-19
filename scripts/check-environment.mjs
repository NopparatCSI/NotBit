import nextEnv from "@next/env";
import { createPublicClient, decodeAbiParameters, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";
import { resolveEscrowSettings } from "../src/lib/chain/settings.ts";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "OK" : "FAIL"} ${label}`); if (!ok) failures++; };
try {
  const e = process.env;
  const config = resolveEscrowSettings(e);
  if (!config) throw new Error("Escrow configuration is incomplete.");
  const client = createPublicClient({ transport: http(config.rpcUrl, { retryCount: 1, timeout: 15000 }) });
  check(await client.getChainId() === config.chainId, "RPC chain matches configured chain");
  check(Boolean(await client.getCode({ address: config.escrowAddress })), "Escrow bytecode exists");
  check(config.chainId === 31337 || config.startBlock > 0n, "Indexer start block configured");
  const abi = parseAbi(["function admin() view returns(address)", "function superAdmin() view returns(address)"]);
  const [admin, superAdmin] = await Promise.all(["admin", "superAdmin"].map(functionName => client.readContract({ address: config.escrowAddress, abi, functionName })));
  for (const [name, value] of [["SEPOLIA_ADMIN_ADDRESS", admin], ["SEPOLIA_SUPER_ADMIN_ADDRESS", superAdmin]]) {
    check(e[name]?.toLowerCase() === value.toLowerCase(), `${name} matches contract`);
  }
  const deploymentHash = e.ESCROW_DEPLOY_TX_HASH || (config.escrowAddress === "0x3d32396cd1017ded8cce5150b88ee6feb3ca6ebe" ? "0x975a81a218bf2ff4b0055346230603c48cc9f32a6130d112bbe48c5278805395" : null);
  if (deploymentHash) {
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash: deploymentHash }), client.getTransactionReceipt({ hash: deploymentHash })]);
    check(tx.to === null && receipt.contractAddress?.toLowerCase() === config.escrowAddress && receipt.status === "success", "Deployment belongs to configured escrow");
    check(receipt.blockNumber === config.startBlock, "Indexer starts at deployment block");
    const [treasury, signer] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }], `0x${tx.input.slice(-256)}`);
    check(e.SEPOLIA_TREASURY_ADDRESS?.toLowerCase() === treasury.toLowerCase(), "Treasury matches deployment");
    check(e.SEPOLIA_EVIDENCE_SIGNER_ADDRESS?.toLowerCase() === signer.toLowerCase(), "Evidence signer address matches deployment");
  }
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicDb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const [staff, games] = await Promise.all([db.from("staff_wallets").select("wallet,role"), publicDb.from("games").select("slug").limit(1)]);
  check(!games.error, "Supabase publishable key can read public data");
  check(!staff.error && staff.data?.length === 2 && staff.data.some(row => row.role === "ADMIN" && row.wallet === admin.toLowerCase()) && staff.data.some(row => row.role === "SUPER_ADMIN" && row.wallet === superAdmin.toLowerCase()), "Database staff roles match deployed fixed roles");
  for (const [name, expected] of [["EVIDENCE_SIGNER_PRIVATE_KEY", e.SEPOLIA_EVIDENCE_SIGNER_ADDRESS], ["INDEXER_SENDER_PRIVATE_KEY", null]]) {
    if (!e[name]) { console.log(`MISSING ${name}`); continue; }
    const account = privateKeyToAccount(e[name]);
    if (expected) check(account.address.toLowerCase() === expected.toLowerCase(), "Evidence signing key matches expected signer");
    else console.log(`Escalation sender: ${account.address} · balance ${await client.getBalance({ address: account.address })} wei`);
  }
} catch { failures++; console.error("FAIL environment verification. Check credentials, deployment metadata and RPC connectivity; provider details were withheld."); }
process.exitCode = failures ? 1 : 0;
