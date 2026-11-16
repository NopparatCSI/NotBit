import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { requiredConfirmations, walletSchema } from "@marketplace/shared";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { deployEscrow, DeploymentError } from "./deploy-escrow";

function readEnv(name: string) {
  try {
    return parseEnv(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function main() {
  const settings = { ...readEnv(".env"), ...readEnv(".env.local"), ...process.env };
  const names = [
    "SEPOLIA_RPC_URL", "SEPOLIA_DEPLOYER_PRIVATE_KEY", "SEPOLIA_TREASURY_ADDRESS",
    "SEPOLIA_EVIDENCE_SIGNER_ADDRESS", "SEPOLIA_ADMIN_ADDRESS", "SEPOLIA_SUPER_ADMIN_ADDRESS",
  ] as const;
  const missing = names.filter((name) => !settings[name]?.trim());
  if (missing.length) throw new DeploymentError(`Missing settings: ${missing.join(", ")}`);

  function readAddress(name: (typeof names)[number]) {
    const result = walletSchema.safeParse(settings[name]?.trim());
    if (!result.success) throw new DeploymentError(`Invalid Wallet address in ${name}.`);
    return result.data;
  }

  const rpcUrl = settings.SEPOLIA_RPC_URL!.trim();
  if (URL.parse(rpcUrl)?.protocol !== "https:") {
    throw new DeploymentError("SEPOLIA_RPC_URL must be a valid HTTPS URL.");
  }
  const privateKey = settings.SEPOLIA_DEPLOYER_PRIVATE_KEY!.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new DeploymentError("Invalid SEPOLIA_DEPLOYER_PRIVATE_KEY format.");
  }

  const deployment = await deployEscrow({
    chain: sepolia,
    rpcUrl,
    deployer: privateKeyToAccount(privateKey as `0x${string}`),
    treasury: readAddress("SEPOLIA_TREASURY_ADDRESS"),
    evidenceSigner: readAddress("SEPOLIA_EVIDENCE_SIGNER_ADDRESS"),
    admin: readAddress("SEPOLIA_ADMIN_ADDRESS"),
    superAdmin: readAddress("SEPOLIA_SUPER_ADMIN_ADDRESS"),
    confirmations: requiredConfirmations,
  });

  console.log(JSON.stringify(deployment, null, 2));
}

try {
  await main();
} catch (error) {
  // RPC error details can include the provider URL, which may contain a secret.
  console.error(error instanceof DeploymentError
    ? error.message
    : "Deployment could not be confirmed. Check the RPC and any reported transaction hash before retrying.");
  process.exitCode = 1;
}
