import { readFileSync, appendFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, keccak256, type Hex, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { hardhat } from "viem/chains";
import sharp from "sharp";
import { escrowAbi, hashAgreement, toChainId } from "@marketplace/shared";
import { offerTypedData, type Offer } from "../../src/lib/offers/model";

export const state = JSON.parse(readFileSync(".runtime/acceptance/state.json", "utf8"));
const credentials = JSON.parse(readFileSync(".runtime/acceptance/credentials.json", "utf8"));
if (state.appUrl !== "http://localhost:3201" || state.supabaseUrl !== "http://127.0.0.1:54331" || state.rpcUrl !== "http://127.0.0.1:8545" || state.chainId !== 31337) throw new Error("Acceptance tests require the separate local stack.");
export const names = ["buyer", "seller", "admin", "superAdmin", "treasury", "evidenceSigner", "outsider", "deployer", "sender"] as const;
export type Person = typeof names[number];
// These publicly documented development accounts are used only on chain 31337.
export const accounts = Object.fromEntries(names.map((name, addressIndex) => [name, mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex })])) as Record<Person, ReturnType<typeof mnemonicToAccount>>;
export const client = createPublicClient({ chain: hardhat, transport: http(state.rpcUrl) });
export const wallet = (name: Person) => createWalletClient({ account: accounts[name], chain: hardhat, transport: http(state.rpcUrl) });
export const service = createClient(state.supabaseUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
export type Session = { person: Person; auth: ReturnType<typeof createServerClient>; cookie: () => string; id: string };
export const sessions = {} as Record<Person, Session>;
export function record(step: string, data: Record<string, unknown>) { appendFileSync(".runtime/acceptance/results.jsonl", JSON.stringify({ time: new Date().toISOString(), step, ...data }, (_, v) => typeof v === "bigint" ? v.toString() : v) + "\n"); }

export async function login(person: Person) {
  const cookies = new Map<string, string>();
  const auth = createServerClient(state.supabaseUrl, credentials.publishableKey, { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  const account = accounts[person];
  const message = createSiweMessage({ address: account.address, domain: "localhost:3201", uri: state.appUrl, chainId: 11155111, version: "1", nonce: generateSiweNonce(), statement: "Isolated marketplace acceptance test." });
  const result = await auth.auth.signInWithWeb3({ chain: "ethereum", message, signature: await account.signMessage({ message }) });
  if (result.error || !result.data.user) throw new Error(`Sign-in failed for ${person}: ${result.error?.message}`);
  return sessions[person] = { person, auth, id: result.data.user.id, cookie: () => [...cookies].map(([n,v]) => `${n}=${v}`).join("; ") };
}
export async function api(person: Person | null, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${state.appUrl}/api/v1${path}`, { method, signal: AbortSignal.timeout(40_000), headers: { ...(person ? { Cookie: sessions[person].cookie() } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  return { status: response.status, ...json };
}
export async function mine(blocks = 3) { await client.request({ method: "hardhat_mine" as never, params: [`0x${blocks.toString(16)}`] as never }); }
export async function index() {
  await mine();
  const response = await fetch(`${state.appUrl}/api/v1/internal/indexer`, { method: "POST", headers: { Authorization: `Bearer ${credentials.indexerSecret}` } });
  const json = await response.json();
  if (!response.ok) throw new Error(`Indexer failed: ${JSON.stringify(json)}`);
  return json.data;
}
export async function send(person: Person, functionName: string, args: readonly unknown[], value?: bigint) {
  const simulation = await client.simulateContract({ address: state.escrowAddress, abi: escrowAbi, functionName: functionName as never, args: args as never, account: accounts[person], ...(value !== undefined ? { value } : {}) });
  const hash = await wallet(person).writeContract(simulation.request as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  record(functionName, { person, hash, blockNumber: receipt.blockNumber });
  await mine();
  return hash;
}
export async function createDeal(label: string, amount = "1000000000000000") {
  const listing = await api("seller", "/listings", "POST", { gameSlug: "warframe", title: `Acceptance ${label} ${crypto.randomUUID().slice(0,8)}`, description: "Isolated acceptance fixture", quantity: 1, region: "Asia", deliveryMethod: "In-game trade", priceWei: amount });
  if (listing.status !== 201) throw new Error(`Listing failed: ${JSON.stringify(listing)}`);
  const opened = await api("buyer", "/conversations", "POST", { listingId: listing.data.id });
  if (opened.status !== 200) throw new Error(`Conversation failed: ${JSON.stringify(opened)}`);
  const conversationId = opened.data.id;
  const context = (await api("seller", `/conversations/${conversationId}/offers`)).data.context;
  const agreement = { title: listing.data.title, quantity: 1, gameSlug: "warframe", region: "Asia", buyerCharacter: "Acceptance Buyer", sellerCharacter: "Acceptance Seller", deliveryMethod: "In-game trade", meetingTime: new Date(Date.now() + 3600_000).toISOString() };
  const id = crypto.randomUUID();
  const offer: Offer = { id, agreement, ...context, status: "OPEN", signedOffer: { orderId: toChainId(id), listingId: toChainId(listing.data.id), buyer: context.buyer, seller: context.seller, amount, expiresAt: Math.floor(Date.now()/1000) + 1700, agreementHash: hashAgreement(agreement), signature: "0x" } };
  offer.signedOffer.signature = await accounts.seller.signTypedData(offerTypedData(offer));
  const saved = await api("seller", `/conversations/${conversationId}/offers`, "POST", { id, agreement, signedOffer: offer.signedOffer });
  if (saved.status !== 201) throw new Error(`Offer failed: ${JSON.stringify(saved)}`);
  record("fixture", { label, orderId: id, conversationId, listingId: listing.data.id });
  return { offer, conversationId, listing: listing.data };
}
export type Deal = Awaited<ReturnType<typeof createDeal>>;
export async function fund(deal: Deal) {
  const hash = await send("buyer", "fundOrder", [offerTypedData(deal.offer).message, deal.offer.signedOffer.signature], BigInt(deal.offer.signedOffer.amount));
  const attempt = await api("buyer", `/orders/${deal.offer.id}`, "POST", { hash });
  if (![200,201].includes(attempt.status)) throw new Error(`Funding record: ${JSON.stringify(attempt)}`);
  await index();
  return hash;
}
export async function imageBytes() { return sharp({ create: { width: 32, height: 32, channels: 3, background: "#2463eb" } }).png().toBuffer(); }
export async function evidence(person: "buyer" | "seller", deal: Deal, stage: "delivery" | "receipt" | "dispute") {
  const bytes = await imageBytes();
  const ticket = await api(person, "/uploads", "POST", { purpose: "evidence", scopeId: deal.offer.id, contentType: "image/png", sizeBytes: bytes.length, fileHash: keccak256(bytes) });
  if (ticket.status !== 201) throw new Error(`Upload ticket failed: ${JSON.stringify(ticket)}`);
  const upload = await fetch(ticket.data.signedUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: bytes });
  if (!upload.ok) throw new Error(`Storage upload failed: ${upload.status}`);
  const result = await api(person, `/orders/${deal.offer.id}/evidence`, "POST", { stage, ticketIds: [ticket.data.ticketId] });
  if (result.status !== 201) throw new Error(`Evidence failed: ${JSON.stringify(result)}`);
  return result.data;
}
export async function confirm(person: "buyer" | "seller", receipt: { signature: Hex; [key: string]: unknown }) {
  const { signature, ...fields } = receipt;
  return send(person, person === "seller" ? "confirmDelivery" : "confirmReceipt", [fields, signature]);
}
export async function chainOrder(deal: Deal) { return client.readContract({ address: state.escrowAddress as Address, abi: escrowAbi, functionName: "getOrder", args: [deal.offer.signedOffer.orderId] }); }
