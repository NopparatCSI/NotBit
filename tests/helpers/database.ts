import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { demoViewers, toChainId } from "@marketplace/shared";

export const listingId = "30000000-0000-4000-8000-000000000001";
export const conversationId = "40000000-0000-4000-8000-000000000001";
export const orderId = "20000000-0000-4000-8000-000000000001";
export const replacementId = "20000000-0000-4000-8000-000000000002";
export const amount = "10000000000000000";
export const hex = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;

const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
export async function applyMigrations(db: PGlite, after = "", through = "99999999999999") {
  const files = (await readdir(migrationDirectory)).filter(file => file.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.slice(0, 14);
    if (version > after && version <= through) await db.exec(await readFile(new URL(file, migrationDirectory), "utf8"));
  }
}

export async function createDatabase(through?: string) {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table auth.identities (user_id uuid references auth.users(id), provider text, provider_id text,
        identity_data jsonb, created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);
    `);
    await applyMigrations(db, "", through);
    await db.exec(await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8"));
    for (const viewer of Object.values(demoViewers)) {
      await db.query("insert into auth.users(id) values ($1)", [viewer.id]);
      await db.query("insert into auth.identities(user_id, provider, provider_id, identity_data) values ($1, 'web3', $2, '{}')",
        [viewer.id, `web3:ethereum:${viewer.wallet}`]);
      if (viewer.role !== "USER") await db.query("insert into public.staff_wallets(wallet,role) values($1,$2)", [viewer.wallet, viewer.role]);
    }
    await db.query("insert into public.listings(id,seller_id,game_slug,title,description,quantity,region,delivery_method,price_wei) values($1,$2,'warframe','Demo','Demo',1,'Asia','Trade',$3)",
      [listingId, demoViewers.seller.id, amount]);
    await db.query("insert into public.conversations(id,listing_id,buyer_id,seller_id) values($1,$2,$3,$4)",
      [conversationId, listingId, demoViewers.buyer.id, demoViewers.seller.id]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function addOffer(db: PGlite, id = orderId) {
  await db.query(`insert into public.offers(id,conversation_id,listing_id,buyer_id,seller_id,chain_id,escrow_address,
    chain_order_id,chain_listing_id,amount_wei,agreement,agreement_hash,seller_signature,expires_at)
    values($1,$2,$3,$4,$5,31337,$6,$7,$8,$9,'{}',$7,$10,now()+interval '30 minutes')`,
    [id, conversationId, listingId, demoViewers.buyer.id, demoViewers.seller.id, demoViewers.admin.wallet,
      toChainId(id), toChainId(listingId), amount, "0x" + "1".repeat(130)]);
}

export function fundedEvent(id = orderId, block = 1, fork = 1) {
  return {
    tx_hash: hex(fork * 100 + block), log_index: 0, block_number: block, block_hash: hex(fork * 1000 + block),
    block_timestamp: "2026-11-18T00:00:00Z", event_name: "OrderFunded",
    payload: { orderId: toChainId(id), listingId: toChainId(listingId), buyer: demoViewers.buyer.wallet,
      seller: demoViewers.seller.wallet, amount, deadline: "1795046400", agreementHash: toChainId(id) },
  };
}
