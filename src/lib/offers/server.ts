import "server-only";
import { createPublicClient, encodeFunctionData, http, parseEventLogs, verifyTypedData, type Address, type Hex } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { escrowAbi, offerLifetime, orderStatuses, requiredConfirmations, walletSchema } from "@marketplace/shared";
import type { Viewer } from "@marketplace/shared";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { ChatError, requireConversation } from "@/lib/trade/server";
import { matchesAgreement, offerTypedData, type Offer, type OfferContext, type OrderFunding } from "./model";

const offerColumns = "id, agreement, chain_id, escrow_address, chain_order_id, chain_listing_id, amount_wei, agreement_hash, seller_signature, status, expires_at, buyer_id, seller_id, listing_id, conversation_id";

type OfferRow = {
  id: string;
  agreement: Offer["agreement"];
  chain_id: Offer["chainId"];
  escrow_address: Offer["escrowAddress"];
  chain_order_id: Hex;
  chain_listing_id: Hex;
  amount_wei: string;
  agreement_hash: Hex;
  seller_signature: Hex;
  status: Offer["status"];
  expires_at: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  conversation_id: string;
};

function configuration() {
  const environment = process.env;
  const chainId = Number(environment.ESCROW_CHAIN_ID ?? "11155111");
  const address = walletSchema.safeParse(environment.ESCROW_ADDRESS ?? environment.NEXT_PUBLIC_ESCROW_ADDRESS);
  if ((chainId !== 11155111 && chainId !== 31337) || !address.success) {
    throw new ChatError(503, "UNAVAILABLE", "Escrow is not configured for this marketplace.");
  }
  return { chainId, escrowAddress: address.data } as Pick<OfferContext, "chainId" | "escrowAddress">;
}

export function escrowClient(chainId: Offer["chainId"]) {
  const rpc = chainId === 31337 ? process.env.ESCROW_RPC_URL ?? "http://127.0.0.1:8545" : process.env.SEPOLIA_RPC_URL;
  return createPublicClient({ chain: chainId === 31337 ? hardhat : sepolia, transport: http(rpc, { timeout: 15000, retryCount: 1 }) });
}

async function requireDatabase() {
  const db = await createServerSupabase();
  if (!db) throw new ChatError(503, "UNAVAILABLE", "Supabase is not configured.");
  return db;
}

function checkError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === "23514") throw new ChatError(409, "CONFLICT", "The listing is no longer available for a new offer.");
  throw new ChatError(503, "UNAVAILABLE", "Offers are temporarily unavailable. Please try again.");
}

export async function offerContext(conversationId: string, viewer: Viewer) {
  const room = await requireConversation(conversationId, viewer.id);
  const db = await requireDatabase();
  const { data, error } = await db.rpc("get_conversation_wallets", { p_conversation_id: conversationId }).maybeSingle()
    .returns<{ buyer: Address; seller: Address }>();
  checkError(error);
  if (!data) throw new ChatError(404, "NOT_FOUND", "Conversation not found.");
  return { room, context: { ...configuration(), buyer: data.buyer, seller: data.seller } as OfferContext };
}

function toOffer(row: OfferRow, wallets: Pick<OfferContext, "buyer" | "seller">): Offer {
  return {
    id: row.id, agreement: row.agreement, chainId: row.chain_id, escrowAddress: row.escrow_address,
    status: row.status === "OPEN" && new Date(row.expires_at).getTime() <= Date.now() ? "EXPIRED" : row.status,
    signedOffer: {
      orderId: row.chain_order_id, listingId: row.chain_listing_id, buyer: wallets.buyer, seller: wallets.seller,
      amount: row.amount_wei, agreementHash: row.agreement_hash,
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000), signature: row.seller_signature,
    },
  };
}

export async function listOffers(conversationId: string, viewer: Viewer, selectedId?: string) {
  const { context } = await offerContext(conversationId, viewer);
  const db = await requireDatabase();
  const { data, error } = await db.from("offers").select(offerColumns).eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).order("id").limit(20).returns<OfferRow[]>();
  checkError(error);
  const rows = data ?? [];
  if (selectedId && !rows.some(({ id }) => id === selectedId)) {
    const selected = await db.from("offers").select(offerColumns).eq("conversation_id", conversationId)
      .eq("id", selectedId).maybeSingle().returns<OfferRow>();
    checkError(selected.error);
    if (!selected.data) throw new ChatError(404, "NOT_FOUND", "The selected offer was not found in this conversation.");
    rows.unshift(selected.data);
  }
  const offers = rows.map((row) => toOffer(row, context));
  if (selectedId) offers.sort((first, second) => Number(second.id === selectedId) - Number(first.id === selectedId));
  return { context, offers };
}

export async function saveOffer(conversationId: string, viewer: Viewer, input: Pick<Offer, "id" | "agreement" | "signedOffer">) {
  const { room, context } = await offerContext(conversationId, viewer);
  if (viewer.id !== room.sellerId) throw new ChatError(403, "FORBIDDEN", "Only the seller can create an offer.");
  const offer = { ...input, ...context, status: "OPEN" as const };
  const signed = input.signedOffer;
  const expiry = signed.expiresAt;
  const now = Math.floor(Date.now() / 1000);
  if (!matchesAgreement(offer, room.listing.id) || signed.buyer !== context.buyer || signed.seller !== context.seller ||
      input.agreement.gameSlug !== room.listing.game_slug || input.agreement.title !== room.listing.title || input.agreement.quantity > room.listing.quantity) {
    throw new ChatError(400, "INVALID_INPUT", "The signed offer does not match this conversation and agreement.");
  }
  if (!(await verifyTypedData({ ...offerTypedData(offer), address: context.seller, signature: signed.signature }))) {
    throw new ChatError(400, "INVALID_INPUT", "The seller signature is invalid.");
  }
  const db = createServiceSupabase();
  const previous = await db.from("offers").select(offerColumns).eq("id", input.id).maybeSingle().returns<OfferRow>();
  checkError(previous.error);
  if (previous.data) {
    if (previous.data.conversation_id === conversationId && previous.data.seller_signature === signed.signature &&
        previous.data.agreement_hash === signed.agreementHash && previous.data.amount_wei === signed.amount &&
        previous.data.chain_id === context.chainId && previous.data.escrow_address === context.escrowAddress) {
      return toOffer(previous.data, context);
    }
    throw new ChatError(409, "CONFLICT", "This offer ID has already been used.");
  }
  if (expiry <= now || expiry > now + offerLifetime || new Date(input.agreement.meetingTime).getTime() <= Date.now()) {
    throw new ChatError(400, "INVALID_INPUT", "Choose a future meeting time and an offer expiry within 30 minutes.");
  }
  const { data, error } = await db.from("offers").insert({
    id: input.id, conversation_id: conversationId, listing_id: room.listing.id, buyer_id: room.buyerId, seller_id: room.sellerId,
    chain_id: context.chainId, escrow_address: context.escrowAddress,
    chain_order_id: signed.orderId, chain_listing_id: signed.listingId, amount_wei: signed.amount,
    agreement: input.agreement, agreement_hash: signed.agreementHash, seller_signature: signed.signature,
    expires_at: new Date(expiry * 1000).toISOString(),
  }).select(offerColumns).single().returns<OfferRow>();
  if (error?.code === "23505") throw new ChatError(409, "CONFLICT", "This offer was already saved. Refresh offers to check it.");
  checkError(error);
  return toOffer(data!, context);
}

export async function requireOffer(id: string, viewer: Viewer) {
  const db = await requireDatabase();
  const { data, error } = await db.from("offers").select(offerColumns).eq("id", id).maybeSingle().returns<OfferRow>();
  checkError(error);
  if (!data) throw new ChatError(404, "NOT_FOUND", "Offer not found.");
  const { context } = await offerContext(data.conversation_id, viewer);
  return toOffer(data, context);
}

export async function recordFunding(offer: Offer, viewer: Viewer, hash: Hex) {
  if (viewer.wallet !== offer.signedOffer.buyer) throw new ChatError(403, "FORBIDDEN", "Only the buyer can deposit for this offer.");
  const client = escrowClient(offer.chainId);
  let transaction;
  try { transaction = await client.getTransaction({ hash }); }
  catch { throw new ChatError(503, "UNAVAILABLE", "The transaction is not available yet. Retry checking its status."); }
  const expected = encodeFunctionData({ abi: escrowAbi, functionName: "fundOrder", args: [offerTypedData(offer).message, offer.signedOffer.signature] });
  if (transaction.to?.toLowerCase() !== offer.escrowAddress.toLowerCase() ||
      transaction.from.toLowerCase() !== offer.signedOffer.buyer || transaction.value !== BigInt(offer.signedOffer.amount) ||
      transaction.input.toLowerCase() !== expected.toLowerCase()) {
    throw new ChatError(400, "INVALID_INPUT", "This transaction does not fund the selected offer.");
  }
  const db = createServiceSupabase();
  const { error } = await db.from("funding_attempts").insert({ offer_id: offer.id, tx_hash: hash.toLowerCase() });
  if (error?.code !== "23505") checkError(error);
}

export async function readFunding(offer: Offer): Promise<OrderFunding> {
  const db = await requireDatabase();
  const attempts = await db.from("funding_attempts").select("tx_hash").eq("offer_id", offer.id)
    .order("id", { ascending: false }).limit(10);
  checkError(attempts.error);
  const client = escrowClient(offer.chainId);
  try {
    const tip = await client.getBlockNumber({ cacheTime: 0 });
    const confirmedAt = tip >= BigInt(requiredConfirmations - 1) ? tip - BigInt(requiredConfirmations - 1) : 0n;
    const order = await client.readContract({ address: offer.escrowAddress, abi: escrowAbi, functionName: "getOrder",
      args: [offer.signedOffer.orderId], blockNumber: confirmedAt });
    if (order.status > 0 && order.buyer.toLowerCase() === offer.signedOffer.buyer &&
        order.seller.toLowerCase() === offer.signedOffer.seller && order.amount === BigInt(offer.signedOffer.amount) &&
        order.agreementHash === offer.signedOffer.agreementHash && order.listingId === offer.signedOffer.listingId) {
      return { status: "CONFIRMED", confirmations: requiredConfirmations, hash: null,
        orderStatus: orderStatuses[order.status], deadline: Number(order.deadline) };
    }
    for (const { tx_hash } of attempts.data ?? []) {
      const receipt = await client.getTransactionReceipt({ hash: tx_hash }).catch(() => null);
      if (!receipt) continue;
      const events = parseEventLogs({ abi: escrowAbi, eventName: "OrderFunded", logs: receipt.logs, strict: true });
      const funded = events.some((event) => event.address.toLowerCase() === offer.escrowAddress.toLowerCase() && event.args.orderId === offer.signedOffer.orderId);
      const confirmations = Math.max(0, Number(tip - receipt.blockNumber + 1n));
      return { status: receipt.status !== "success" || !funded ? "FAILED" : "CONFIRMING", confirmations,
        hash: tx_hash, orderStatus: null, deadline: null };
    }
    return { status: attempts.data?.length ? "SUBMITTED" : "AWAITING_DEPOSIT", confirmations: 0,
      hash: attempts.data?.[0]?.tx_hash ?? null, orderStatus: null, deadline: null };
  } catch {
    throw new ChatError(503, "UNAVAILABLE", "Blockchain verification is unavailable. Your deposit status is still being checked.");
  }
}
