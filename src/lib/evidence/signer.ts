import "server-only";
import { isAddressEqual, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainIds, escrowDomain, evidenceReceiptSchema, evidenceReceiptTypes, walletSchema, type EvidenceReceipt } from "@marketplace/shared";
import { ApiError } from "@/lib/api/response";

function signerAccount() {
  const key = process.env.EVIDENCE_SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new ApiError(503, "UNAVAILABLE", "The evidence signer is not configured.");
  }
  return privateKeyToAccount(key as Hex);
}

export function requireEvidenceSigner(chainId: number) {
  const account = signerAccount();
  const expectedAddress = process.env.SEPOLIA_EVIDENCE_SIGNER_ADDRESS;
  if (chainId === chainIds.sepolia && expectedAddress) {
    const expected = walletSchema.safeParse(expectedAddress);
    if (!expected.success || !isAddressEqual(account.address, expected.data)) {
      throw new ApiError(503, "UNAVAILABLE", "The evidence signer does not match the configured Sepolia escrow signer.");
    }
  }
  return account;
}

// Signs the EIP-712 receipt the contract checks in confirmDelivery / confirmReceipt.
export async function signEvidenceReceipt(account: ReturnType<typeof requireEvidenceSigner>, input: {
  chainId: number;
  escrowAddress: Address;
  orderId: Hex;
  submitter: Address;
  stage: 0 | 1;
  evidenceHash: Hex;
}): Promise<EvidenceReceipt> {
  const message = {
    orderId: input.orderId, submitter: input.submitter, stage: input.stage, evidenceHash: input.evidenceHash,
  };
  const signature = await account.signTypedData({
    domain: escrowDomain(input.chainId, input.escrowAddress),
    types: evidenceReceiptTypes,
    primaryType: "EvidenceReceipt",
    message,
  });
  return evidenceReceiptSchema.parse({ ...message, signature });
}
