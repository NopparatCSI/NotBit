import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { artifacts, network } from "hardhat";
import {
  deliveryWindow, escrowAbi, escrowDomain, evidenceReceiptTypes, evidenceStages, offerLifetime,
  hashDecision, offerTypes, orderStatuses, receiptWindow, splitPayment,
} from "@marketplace/shared";
import {
  createPublicClient, createWalletClient, custom, hashMessage, isAddressEqual, parseAbi, parseEther, parseEventLogs, toFunctionSelector,
  zeroAddress, zeroHash, type Abi, type Address, type Hex,
} from "viem";
import { hardhat } from "viem/chains";

const status = (name: (typeof orderStatuses)[number]) => orderStatuses.indexOf(name);
const amount = parseEther("0.01");

async function setup(t: TestContext, rejectFee = false) {
  const connection = await network.create();
  t.after(() => connection.close());
  const transport = custom(connection.provider, { retryCount: 0 });
  const client = createPublicClient({ transport, chain: hardhat });
  const wallet = createWalletClient({ transport, chain: hardhat });
  const [deployer, buyer, seller, feeRecipient, evidenceSigner, outsider, admin, superAdmin] = await wallet.getAddresses();
  if (!deployer || !buyer || !seller || !feeRecipient || !evidenceSigner || !outsider || !admin || !superAdmin) {
    throw new Error("Expected eight Hardhat development accounts.");
  }

  async function deploy(name: string, args: readonly Address[] = []) {
    const { abi, bytecode } = await artifacts.readArtifact(name);
    const hash = await wallet.deployContract({ account: deployer, abi: abi as Abi, bytecode: bytecode as Hex, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    assert.ok(receipt.contractAddress);
    return receipt.contractAddress;
  }

  const treasury = rejectFee ? await deploy("RejectEther") : feeRecipient;
  const address = await deploy("MarketplaceEscrow", [treasury, evidenceSigner, admin, superAdmin]);
  const contract = { abi: escrowAbi, address } as const;
  const domain = escrowDomain(hardhat.id, address);
  const signOffer = (message: TestOffer, account = seller, signingDomain = domain) => wallet.signTypedData({
    account, domain: signingDomain, types: offerTypes, primaryType: "Offer", message,
  });
  const signEvidence = (message: TestEvidence, account = evidenceSigner, signingDomain = domain) => wallet.signTypedData({
    account, domain: signingDomain, types: evidenceReceiptTypes, primaryType: "EvidenceReceipt", message,
  });

  async function makeOffer(sequence = "1", overrides: Partial<TestOffer> = {}): Promise<TestOffer> {
    const { timestamp } = await client.getBlock();
    return {
      listingId: hashMessage(`listing-${sequence}`),
      orderId: hashMessage(`order-${sequence}`),
      agreementHash: hashMessage(`agreement-${sequence}`),
      amount,
      buyer,
      seller,
      expiresAt: timestamp + BigInt(offerLifetime),
      ...overrides,
    };
  }

  async function waitMined(hash: Hex) {
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    return receipt;
  }

  async function fund(offer: TestOffer) {
    const signature = await signOffer(offer);
    return waitMined(await wallet.writeContract({
      ...contract, account: offer.buyer, functionName: "fundOrder", args: [offer, signature], value: offer.amount,
    }));
  }

  function evidence(offer: TestOffer, stage: 0 | 1): TestEvidence {
    return {
      orderId: offer.orderId,
      submitter: stage === evidenceStages.delivery ? offer.seller : offer.buyer,
      stage,
      evidenceHash: hashMessage(`evidence-${offer.orderId}-${stage}`),
    };
  }

  async function confirm(receipt: TestEvidence) {
    const signature = await signEvidence(receipt);
    return waitMined(await wallet.writeContract({
      ...contract, account: receipt.submitter,
      functionName: receipt.stage === evidenceStages.delivery ? "confirmDelivery" : "confirmReceipt",
      args: [receipt, signature],
    }));
  }

  const getOrder = (orderId: Hex) => client.readContract({ ...contract, functionName: "getOrder", args: [orderId] });
  const getBalance = (account: Address) => client.getBalance({ address: account });
  async function moveTo(timestamp: bigint) {
    await connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [Number(timestamp)] });
    await connection.provider.request({ method: "evm_mine", params: [] });
  }

  return {
    address, contract, domain, client, wallet, connection, buyer, seller, treasury, outsider, admin, superAdmin, deploy,
    signOffer, signEvidence, makeOffer, fund, evidence, confirm, getOrder, getBalance, moveTo, waitMined,
  };
}

type TestOffer = {
  orderId: Hex;
  listingId: Hex;
  buyer: Address;
  seller: Address;
  amount: bigint;
  expiresAt: bigint;
  agreementHash: Hex;
};

type TestEvidence = { orderId: Hex; submitter: Address; stage: 0 | 1; evidenceHash: Hex };

test("funds, records both evidence receipts, and pays 95/5 once", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  const fundedTx = await f.fund(offer);
  const fundedAt = (await f.client.getBlock({ blockNumber: fundedTx.blockNumber })).timestamp;
  const funded = await f.getOrder(offer.orderId);
  assert.equal(funded.status, status("FUNDED"));
  assert.equal(funded.agreementHash, offer.agreementHash);
  assert.equal(funded.listingId, offer.listingId);
  assert.ok(isAddressEqual(funded.buyer, offer.buyer));
  assert.ok(isAddressEqual(funded.seller, offer.seller));
  assert.equal(funded.amount, offer.amount);
  assert.equal(funded.deadline, fundedAt + BigInt(deliveryWindow));
  assert.equal(await f.getBalance(f.address), amount);
  assert.deepEqual(parseEventLogs({ abi: escrowAbi, logs: fundedTx.logs }).map((event) => event.eventName), ["OrderFunded"]);

  const delivery = f.evidence(offer, evidenceStages.delivery);
  const deliveredTx = await f.confirm(delivery);
  const deliveredAt = (await f.client.getBlock({ blockNumber: deliveredTx.blockNumber })).timestamp;
  const delivered = await f.getOrder(offer.orderId);
  assert.equal(delivered.status, status("DELIVERED"));
  assert.equal(delivered.deliveryHash, delivery.evidenceHash);
  assert.equal(delivered.deadline, deliveredAt + BigInt(receiptWindow));
  assert.deepEqual(parseEventLogs({ abi: escrowAbi, logs: deliveredTx.logs }).map((event) => event.eventName), ["DeliveryConfirmed"]);

  const balances = await Promise.all([f.getBalance(f.seller), f.getBalance(f.treasury)]);
  const receipt = f.evidence(offer, evidenceStages.receipt);
  const paid = await f.confirm(receipt);
  const released = await f.getOrder(offer.orderId);
  assert.equal(released.status, status("RELEASED"));
  assert.equal(released.receiptHash, receipt.evidenceHash);
  assert.equal(await f.getBalance(f.seller) - balances[0], parseEther("0.0095"));
  assert.equal(await f.getBalance(f.treasury) - balances[1], parseEther("0.0005"));
  assert.equal(await f.getBalance(f.address), 0n);
  const events = parseEventLogs({ abi: escrowAbi, logs: paid.logs });
  assert.deepEqual(events.map((event) => event.eventName), ["ReceiptConfirmed", "OrderReleased"]);
  assert.deepEqual(events.find((event) => event.eventName === "OrderReleased")?.args, {
    orderId: offer.orderId, sellerAmount: parseEther("0.0095"), fee: parseEther("0.0005"),
  });
  await assert.rejects(f.client.simulateContract({
    ...f.contract, functionName: "confirmReceipt", account: f.buyer, args: [receipt, await f.signEvidence(receipt)],
  }), /InvalidOrderState/);
});

test("rejects incorrect funding, self-trades, tampered offers, and signatures for another domain", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  const signature = await f.signOffer(offer);
  const simulate = (message: TestOffer, signed: Hex, account = f.buyer, value = message.amount) =>
    f.client.simulateContract({
      ...f.contract, functionName: "fundOrder", account, args: [message, signed], value,
    });

  await assert.rejects(simulate(offer, signature, f.outsider), /Unauthorized/);
  await assert.rejects(simulate(offer, signature, f.buyer, offer.amount - 1n), /IncorrectAmount/);
  await assert.rejects(simulate({ ...offer, seller: f.buyer }, signature), /InvalidOffer/);
  await assert.rejects(simulate({ ...offer, orderId: zeroHash }, signature), /InvalidOffer/);
  await assert.rejects(simulate({ ...offer, agreementHash: hashMessage("changed") }, signature), /InvalidSignature/);
  await assert.rejects(simulate({ ...offer, amount: amount + 1n }, signature), /InvalidSignature/);
  await assert.rejects(simulate(offer, "0x"), /InvalidSignature/);
  await assert.rejects(simulate(offer, await f.signOffer(offer, f.outsider)), /InvalidSignature/);
  await assert.rejects(simulate(offer, await f.signOffer(offer, f.seller, { ...f.domain, chainId: 11155111 })), /InvalidSignature/);
  const otherEscrow = await f.deploy("MarketplaceEscrow", [f.treasury, f.outsider, f.admin, f.superAdmin]);
  await assert.rejects(simulate(offer, await f.signOffer(offer, f.seller, { ...f.domain, verifyingContract: otherEscrow })), /InvalidSignature/);
  const tooLong = { ...offer, expiresAt: (await f.client.getBlock()).timestamp + BigInt(offerLifetime + 1) };
  await assert.rejects(simulate(tooLong, await f.signOffer(tooLong)), /InvalidOffer/);

  await f.fund(offer);
  await assert.rejects(simulate(offer, signature), /InvalidOrderState/);
  const duplicateListing = await f.makeOffer("2", { listingId: offer.listingId });
  await assert.rejects(simulate(duplicateListing, await f.signOffer(duplicateListing)), /ListingAlreadyFunded/);
  assert.equal(await f.getBalance(f.address), amount);
});

test("rejects wrong callers, order, stage, and signer for evidence", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  const other = await f.makeOffer("2");
  await f.fund(offer);
  await f.fund(other);
  const delivery = f.evidence(offer, evidenceStages.delivery);
  const receipt = f.evidence(offer, evidenceStages.receipt);
  const signed = await f.signEvidence(delivery);
  const simulate = (
    functionName: "confirmDelivery" | "confirmReceipt", message: TestEvidence, signature: Hex, account = message.submitter,
  ) => f.client.simulateContract({ ...f.contract, functionName, args: [message, signature], account });

  await assert.rejects(simulate("confirmReceipt", receipt, await f.signEvidence(receipt)), /InvalidOrderState/);
  await assert.rejects(simulate("confirmDelivery", delivery, signed, f.buyer), /Unauthorized/);
  await assert.rejects(simulate("confirmDelivery", { ...delivery, submitter: f.buyer }, signed, f.seller), /InvalidReceipt/);
  await assert.rejects(simulate("confirmDelivery", { ...delivery, stage: evidenceStages.receipt }, signed), /InvalidReceipt/);
  await assert.rejects(simulate("confirmDelivery", { ...delivery, evidenceHash: zeroHash }, signed), /InvalidReceipt/);
  await assert.rejects(simulate("confirmDelivery", { ...delivery, orderId: other.orderId }, signed), /InvalidSignature/);
  await assert.rejects(simulate("confirmDelivery", delivery, await f.signEvidence(delivery, f.outsider)), /InvalidSignature/);
  await assert.rejects(simulate("confirmDelivery", delivery, await f.signEvidence(delivery, undefined, {
    ...f.domain, verifyingContract: f.outsider,
  })), /InvalidSignature/);
  await f.confirm(delivery);
  await assert.rejects(simulate("confirmDelivery", delivery, signed), /InvalidOrderState/);
  await assert.rejects(simulate("confirmReceipt", receipt, signed), /InvalidSignature/);
  await assert.rejects(simulate("confirmReceipt", receipt, await f.signEvidence(receipt), f.seller), /Unauthorized/);
});

test("rejects an expired offer and retains funds at the delivery and receipt deadlines", async (t) => {
  const f = await setup(t);
  const expired = await f.makeOffer();
  const signature = await f.signOffer(expired);
  await f.moveTo(expired.expiresAt);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, functionName: "fundOrder", account: f.buyer, args: [expired, signature], value: amount,
  }), /DeadlinePassed/);

  const deliveryLate = await f.makeOffer("2");
  const receiptLate = await f.makeOffer("3");
  await f.fund(deliveryLate);
  await f.fund(receiptLate);
  await f.confirm(f.evidence(receiptLate, evidenceStages.delivery));

  const delivery = f.evidence(deliveryLate, evidenceStages.delivery);
  await f.moveTo((await f.getOrder(deliveryLate.orderId)).deadline);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, functionName: "confirmDelivery", account: f.seller, args: [delivery, await f.signEvidence(delivery)],
  }), /DeadlinePassed/);
  const receipt = f.evidence(receiptLate, evidenceStages.receipt);
  await f.moveTo((await f.getOrder(receiptLate.orderId)).deadline);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, functionName: "confirmReceipt", account: f.buyer, args: [receipt, await f.signEvidence(receipt)],
  }), /DeadlinePassed/);
  assert.equal((await f.getOrder(deliveryLate.orderId)).status, status("FUNDED"));
  assert.equal((await f.getOrder(receiptLate.orderId)).status, status("DELIVERED"));
  assert.equal(await f.getBalance(f.address), amount * 2n);
});

test("only one buyer can fund a listing when both transactions are mined in the same block", async (t) => {
  const f = await setup(t);
  const first = await f.makeOffer();
  const second = await f.makeOffer("2", { buyer: f.outsider, listingId: first.listingId });
  const submit = async (offer: TestOffer) => f.wallet.writeContract({
    ...f.contract, functionName: "fundOrder", account: offer.buyer, args: [offer, await f.signOffer(offer)],
    value: offer.amount, gas: 300_000n,
  });
  await f.connection.provider.request({ method: "evm_setAutomine", params: [false] });
  let receipts;
  try {
    const hashes = await Promise.all([submit(first), submit(second)]);
    await f.connection.provider.request({ method: "evm_mine", params: [] });
    receipts = await Promise.all(hashes.map((hash) => f.client.getTransactionReceipt({ hash })));
  } finally {
    await f.connection.provider.request({ method: "evm_setAutomine", params: [true] });
  }
  assert.equal(receipts[0].blockNumber, receipts[1].blockNumber);
  assert.deepEqual(receipts.map((receipt) => receipt.status).sort(), ["reverted", "success"]);
  const orders = await Promise.all([f.getOrder(first.orderId), f.getOrder(second.orderId)]);
  assert.deepEqual(orders.map((order) => order.status).sort(), [status("NONE"), status("FUNDED")]);
  assert.equal(orders.find((order) => order.status === status("NONE"))?.buyer, zeroAddress);
  assert.equal(await f.getBalance(f.address), amount);
});

test("rounds fee down, preserves an unrelated deposit, and queues a rejected payout", async (t) => {
  const f = await setup(t, true);
  const offer = await f.makeOffer("1", { amount: 23n });
  const other = await f.makeOffer("2");
  await f.fund(offer);
  await f.fund(other);
  await f.confirm(f.evidence(offer, evidenceStages.delivery));
  const sellerBefore = await f.getBalance(f.seller);
  const paid = await f.confirm(f.evidence(offer, evidenceStages.receipt));
  const { feeWei, sellerWei } = splitPayment(offer.amount.toString());
  assert.equal(feeWei, "1");
  assert.equal(await f.getBalance(f.seller) - sellerBefore, BigInt(sellerWei));
  assert.equal(await f.client.readContract({ ...f.contract, functionName: "pendingPayouts", args: [f.treasury] }), BigInt(feeWei));
  assert.equal(await f.getBalance(f.address), amount + BigInt(feeWei));
  assert.equal((await f.getOrder(offer.orderId)).status, status("RELEASED"));
  assert.equal((await f.getOrder(other.orderId)).status, status("FUNDED"));
  assert.ok(parseEventLogs({ abi: escrowAbi, logs: paid.logs }).some((event) => event.eventName === "PayoutQueued"));
});

test("a buyer can open a dispute and only staff can issue one full refund", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  await f.fund(offer);
  const decisionHash = hashDecision({ orderId: offer.orderId, refundBuyer: true, reason: "Item not delivered" });
  const open = { ...f.contract, functionName: "openDispute", args: [offer.orderId] } as const;
  const resolve = { ...f.contract, functionName: "resolveDispute", args: [offer.orderId, true, decisionHash] } as const;

  await assert.rejects(f.client.simulateContract({ ...open, account: f.outsider }), /Unauthorized/);
  await assert.rejects(f.client.simulateContract({ ...resolve, account: f.admin }), /InvalidOrderState/);
  const opened = await f.waitMined(await f.wallet.writeContract({ ...open, account: f.buyer }));
  assert.equal((await f.getOrder(offer.orderId)).status, status("IN_REVIEW"));
  const [reviewEvent] = parseEventLogs({ abi: escrowAbi, logs: opened.logs, eventName: "OrderInReview" });
  assert.equal(reviewEvent.args.expired, false);
  assert.ok(isAddressEqual(reviewEvent.args.actor, f.buyer));
  assert.equal(await f.getBalance(f.address), amount);

  await assert.rejects(f.client.simulateContract({ ...resolve, account: f.buyer }), /Unauthorized/);
  await assert.rejects(f.client.simulateContract({
    ...resolve, account: f.admin, args: [offer.orderId, true, zeroHash],
  }), /InvalidDecision/);
  const delivery = f.evidence(offer, evidenceStages.delivery);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.seller, functionName: "confirmDelivery", args: [delivery, await f.signEvidence(delivery)],
  }), /InvalidOrderState/);

  const [buyerBefore, sellerBefore, treasuryBefore] = await Promise.all([
    f.getBalance(f.buyer), f.getBalance(f.seller), f.getBalance(f.treasury),
  ]);
  const refunded = await f.waitMined(await f.wallet.writeContract({ ...resolve, account: f.admin }));
  const order = await f.getOrder(offer.orderId);
  assert.equal(order.status, status("REFUNDED"));
  assert.equal(order.decisionHash, decisionHash);
  assert.equal(await f.getBalance(f.buyer) - buyerBefore, amount);
  assert.equal(await f.getBalance(f.seller), sellerBefore);
  assert.equal(await f.getBalance(f.treasury), treasuryBefore);
  assert.equal(await f.getBalance(f.address), 0n);
  assert.deepEqual(parseEventLogs({ abi: escrowAbi, logs: refunded.logs }).map((event) => event.eventName), [
    "DisputeResolved", "OrderRefunded",
  ]);
  await assert.rejects(f.client.simulateContract({ ...resolve, account: f.superAdmin }), /InvalidOrderState/);
  await assert.rejects(f.client.simulateContract({ ...open, account: f.buyer }), /InvalidOrderState/);
  assert.equal(await f.client.readContract({
    ...f.contract, functionName: "listingFunded", args: [offer.listingId],
  }), true);
});

test("any caller can escalate a timed-out order and Super Admin can release the agreed split", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  await f.fund(offer);
  await f.confirm(f.evidence(offer, evidenceStages.delivery));
  const escalate = { ...f.contract, account: f.outsider, functionName: "escalateExpiredOrder", args: [offer.orderId] } as const;
  await assert.rejects(f.client.simulateContract(escalate), /DeadlineNotPassed/);
  await f.moveTo((await f.getOrder(offer.orderId)).deadline);
  const escalated = await f.waitMined(await f.wallet.writeContract(escalate));
  const [reviewEvent] = parseEventLogs({ abi: escrowAbi, logs: escalated.logs, eventName: "OrderInReview" });
  assert.equal(reviewEvent.args.expired, true);
  assert.ok(isAddressEqual(reviewEvent.args.actor, f.outsider));
  assert.equal((await f.getOrder(offer.orderId)).status, status("IN_REVIEW"));
  assert.equal(await f.getBalance(f.address), amount);
  await assert.rejects(f.client.simulateContract(escalate), /InvalidOrderState/);

  const receipt = f.evidence(offer, evidenceStages.receipt);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.buyer, functionName: "confirmReceipt", args: [receipt, await f.signEvidence(receipt)],
  }), /InvalidOrderState/);
  const [sellerBefore, treasuryBefore] = await Promise.all([f.getBalance(f.seller), f.getBalance(f.treasury)]);
  const decisionHash = hashDecision({ orderId: offer.orderId, refundBuyer: false, reason: "Verified delivery" });
  const paid = await f.waitMined(await f.wallet.writeContract({
    ...f.contract, account: f.superAdmin, functionName: "resolveDispute", args: [offer.orderId, false, decisionHash],
  }));
  const order = await f.getOrder(offer.orderId);
  assert.equal(order.status, status("RELEASED"));
  assert.equal(order.decisionHash, decisionHash);
  assert.equal(await f.getBalance(f.seller) - sellerBefore, parseEther("0.0095"));
  assert.equal(await f.getBalance(f.treasury) - treasuryBefore, parseEther("0.0005"));
  assert.equal(await f.getBalance(f.address), 0n);
  assert.deepEqual(parseEventLogs({ abi: escrowAbi, logs: paid.logs }).map((event) => event.eventName), [
    "DisputeResolved", "OrderReleased",
  ]);
});

test("Super Admin can pause new funding while existing orders continue", async (t) => {
  const f = await setup(t);
  const existing = await f.makeOffer();
  const underReview = await f.makeOffer("2");
  await f.fund(existing);
  await f.fund(underReview);
  const pause = { ...f.contract, functionName: "setFundingPaused", args: [true] } as const;
  await assert.rejects(f.client.simulateContract({ ...pause, account: f.admin }), /Unauthorized/);
  await assert.rejects(f.client.simulateContract({ ...pause, account: f.outsider }), /Unauthorized/);
  const paused = await f.waitMined(await f.wallet.writeContract({ ...pause, account: f.superAdmin }));
  assert.equal(await f.client.readContract({ ...f.contract, functionName: "fundingPaused" }), true);
  const [event] = parseEventLogs({ abi: escrowAbi, logs: paused.logs, eventName: "FundingPauseChanged" });
  assert.equal(event.args.paused, true);

  const next = await f.makeOffer("3");
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.buyer, functionName: "fundOrder", args: [next, await f.signOffer(next)], value: amount,
  }), /FundingPaused/);
  await f.confirm(f.evidence(existing, evidenceStages.delivery));
  await f.confirm(f.evidence(existing, evidenceStages.receipt));
  await f.waitMined(await f.wallet.writeContract({
    ...f.contract, account: f.seller, functionName: "openDispute", args: [underReview.orderId],
  }));
  const decision = hashDecision({ orderId: underReview.orderId, refundBuyer: true, reason: "Agreed cancellation" });
  await f.waitMined(await f.wallet.writeContract({
    ...f.contract, account: f.admin, functionName: "resolveDispute", args: [underReview.orderId, true, decision],
  }));
  assert.equal((await f.getOrder(underReview.orderId)).status, status("REFUNDED"));
  assert.equal(await f.getBalance(f.address), 0n);

  await f.waitMined(await f.wallet.writeContract({ ...pause, account: f.superAdmin, args: [false] }));
  await f.fund(next);
  assert.equal((await f.getOrder(next.orderId)).status, status("FUNDED"));
});

test("a failed withdrawal retains the credit and the recipient can withdraw it exactly once while paused", async (t) => {
  const f = await setup(t, true);
  const offer = await f.makeOffer();
  const other = await f.makeOffer("2");
  await f.fund(offer);
  await f.fund(other);
  await f.confirm(f.evidence(offer, evidenceStages.delivery));
  await f.confirm(f.evidence(offer, evidenceStages.receipt));
  const fee = parseEther("0.0005");
  const getPending = () => f.client.readContract({ ...f.contract, functionName: "pendingPayouts", args: [f.treasury] });
  assert.equal(await getPending(), fee);
  await f.waitMined(await f.wallet.writeContract({
    ...f.contract, account: f.superAdmin, functionName: "setFundingPaused", args: [true],
  }));
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.admin, functionName: "withdrawPendingPayout",
  }), /NoPendingPayout/);

  const receiver = { address: f.treasury, abi: parseAbi([
    "function allowPayouts()", "function withdrawFrom(address escrow)", "function withdrawWithCallback(address escrow)",
    "function callbackError() view returns (bytes4)", "error PayoutFailed()", "error NoPendingPayout()",
  ]), account: f.outsider } as const;
  const withdraw = { ...receiver, functionName: "withdrawFrom", args: [f.address] } as const;
  await assert.rejects(f.client.simulateContract(withdraw), /PayoutFailed/);
  assert.equal(await getPending(), fee);
  assert.equal(await f.getBalance(f.address), amount + fee);
  await f.waitMined(await f.wallet.writeContract({ ...receiver, functionName: "allowPayouts" }));
  const paid = await f.waitMined(await f.wallet.writeContract({
    ...withdraw, functionName: "withdrawWithCallback",
  }));
  const [event] = parseEventLogs({ abi: escrowAbi, logs: paid.logs, eventName: "PayoutWithdrawn" });
  assert.ok(isAddressEqual(event.args.recipient, f.treasury));
  assert.equal(event.args.amount, fee);
  assert.equal(await getPending(), 0n);
  assert.equal(await f.client.readContract({ ...receiver, functionName: "callbackError" }),
    toFunctionSelector("ReentrancyGuardReentrantCall()"));
  assert.equal(await f.getBalance(f.treasury), fee);
  assert.equal(await f.getBalance(f.address), amount);
  assert.equal((await f.getOrder(other.orderId)).status, status("FUNDED"));
  await assert.rejects(f.client.simulateContract(withdraw), /NoPendingPayout/);
});

test("receipt confirmation racing a dispute results in one transition", async (t) => {
  const f = await setup(t);
  const offer = await f.makeOffer();
  await f.fund(offer);
  await f.confirm(f.evidence(offer, evidenceStages.delivery));
  const receipt = f.evidence(offer, evidenceStages.receipt);
  const signature = await f.signEvidence(receipt);
  const { provider } = f.connection;

  await provider.request({ method: "evm_setAutomine", params: [false] });
  let results;
  try {
    const hashes = await Promise.all([
      f.wallet.writeContract({
        ...f.contract, account: f.buyer, functionName: "confirmReceipt", args: [receipt, signature], gas: 300_000n,
      }),
      f.wallet.writeContract({
        ...f.contract, account: f.seller, functionName: "openDispute", args: [offer.orderId], gas: 300_000n,
      }),
    ]);
    await provider.request({ method: "evm_mine", params: [] });
    results = await Promise.all(hashes.map((hash) => f.client.getTransactionReceipt({ hash })));
  } finally {
    await provider.request({ method: "evm_setAutomine", params: [true] });
  }

  assert.equal(results[0].blockNumber, results[1].blockNumber);
  assert.deepEqual(results.map((result) => result.status).sort(), ["reverted", "success"]);
  const settled = results[0].status === "success";
  assert.equal((await f.getOrder(offer.orderId)).status, status(settled ? "RELEASED" : "IN_REVIEW"));
  assert.equal(await f.getBalance(f.address), settled ? 0n : amount);
});

test("staff wallets are distinct at installation and cannot trade", async (t) => {
  const f = await setup(t);
  await assert.rejects(f.deploy("MarketplaceEscrow", [f.treasury, f.outsider, f.admin, f.admin]), /revert|InvalidConfiguration/i);
  await assert.rejects(f.deploy("MarketplaceEscrow", [f.treasury, f.outsider, f.admin, zeroAddress]), /revert|InvalidConfiguration/i);
  const [installedAdmin, installedSuperAdmin] = await Promise.all([
    f.client.readContract({ ...f.contract, functionName: "admin" }),
    f.client.readContract({ ...f.contract, functionName: "superAdmin" }),
  ]);
  assert.ok(isAddressEqual(installedAdmin, f.admin));
  assert.ok(isAddressEqual(installedSuperAdmin, f.superAdmin));
  const buyerOffer = await f.makeOffer("1", { buyer: f.admin });
  const sellerOffer = await f.makeOffer("2", { seller: f.superAdmin });
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.admin, functionName: "fundOrder",
    args: [buyerOffer, await f.signOffer(buyerOffer)], value: amount,
  }), /Unauthorized/);
  await assert.rejects(f.client.simulateContract({
    ...f.contract, account: f.buyer, functionName: "fundOrder",
    args: [sellerOffer, await f.signOffer(sellerOffer, f.superAdmin)], value: amount,
  }), /Unauthorized/);
});
