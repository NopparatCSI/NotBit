import { artifacts } from "hardhat";
import { escrowAbi } from "@marketplace/shared";
import {
  createPublicClient, createWalletClient, encodeDeployData, http, isAddressEqual,
  type Abi, type Account, type Address, type Chain, type Hex,
} from "viem";

export class DeploymentError extends Error {}

type DeploymentOptions = {
  chain: Chain;
  rpcUrl: string;
  deployer: Address | Account;
  treasury: Address;
  evidenceSigner: Address;
  admin: Address;
  superAdmin: Address;
  confirmations: number;
};

export async function deployEscrow(options: DeploymentOptions) {
  const { chain, rpcUrl, deployer, treasury, evidenceSigner, admin, superAdmin, confirmations } = options;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport });
  if (await publicClient.getChainId() !== chain.id) {
    throw new DeploymentError(`The RPC must point to chain ${chain.id}.`);
  }
  if (isAddressEqual(admin, superAdmin)) {
    throw new DeploymentError("Admin and Super Admin require different Wallet addresses.");
  }

  const artifact = await artifacts.readArtifact("MarketplaceEscrow");
  const deployment = {
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as Hex,
    args: [treasury, evidenceSigner, admin, superAdmin],
  };

  const account = typeof deployer === "string" ? deployer : deployer.address;
  const [gas, fees, balance] = await Promise.all([
    publicClient.estimateGas({ account, data: encodeDeployData(deployment) }),
    publicClient.estimateFeesPerGas(),
    publicClient.getBalance({ address: account }),
  ]);
  if (balance < gas * fees.maxFeePerGas) {
    throw new DeploymentError(`The deployer ${account} has insufficient test ETH for deployment gas.`);
  }

  const hash = await walletClient.deployContract({ ...deployment, account: deployer, gas, ...fees });
  console.log(`Deployment transaction ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations, timeout: 300_000 });
  const address = receipt.contractAddress;
  if (receipt.status !== "success" || !address) throw new DeploymentError("The deployment transaction reverted.");

  const [code, installedAdmin, installedSuperAdmin] = await Promise.all([
    publicClient.getCode({ address }),
    publicClient.readContract({ abi: escrowAbi, address, functionName: "admin" }),
    publicClient.readContract({ abi: escrowAbi, address, functionName: "superAdmin" }),
  ]);
  if (!code || code === "0x" || !isAddressEqual(installedAdmin, admin) || !isAddressEqual(installedSuperAdmin, superAdmin)) {
    throw new DeploymentError("Deployment verification failed. Check the reported transaction hash before retrying.");
  }

  return {
    chainId: chain.id, escrowAddress: address, transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(), treasury, evidenceSigner, admin, superAdmin,
  };
}
