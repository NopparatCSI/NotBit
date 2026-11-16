import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { deployEscrow } from "./deploy-escrow";

const rpcUrl = "http://127.0.0.1:8545";
const walletClient = createWalletClient({ chain: hardhat, transport: http(rpcUrl) });
const [deployer, buyer, seller, treasury, evidenceSigner, admin, superAdmin] = await walletClient.getAddresses();
if (!deployer || !buyer || !seller || !treasury || !evidenceSigner || !admin || !superAdmin) {
  throw new Error("Start the local Hardhat node with its default development accounts.");
}

const deployment = await deployEscrow({
  chain: hardhat, rpcUrl, deployer, treasury, evidenceSigner, admin, superAdmin, confirmations: 1,
});
console.log(JSON.stringify({ ...deployment, rpcUrl, buyer, seller }, null, 2));
