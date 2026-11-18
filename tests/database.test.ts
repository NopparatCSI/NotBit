import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { demoGames, demoViewers, toChainId } from "@marketplace/shared";

it("applies the migration and enforces identity, role, and row access", async () => {
  const db = await PGlite.create();
  const { buyer, seller, admin, superAdmin } = demoViewers;
  const listingId = "30000000-0000-4000-8000-000000000001";
  const conversationId = "40000000-0000-4000-8000-000000000001";
  const offerId = "20000000-0000-4000-8000-000000000001";
  const otherUserId = "10000000-0000-4000-8000-000000000099";

  try {
    // Reproduce the Supabase tables and roles this migration integrates with.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table auth.identities (
        user_id uuid references auth.users(id), provider text, provider_id text,
        identity_data jsonb, created_at timestamptz default now()
      );
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create schema storage;
      create table storage.buckets (
        id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]
      );
    `);

    async function addWeb3Identity(userId: string, providerId: string, provider = "web3") {
      await db.query("insert into auth.users (id) values ($1)", [userId]);
      await db.query("insert into auth.identities (user_id, provider, provider_id, identity_data) values ($1, $2, $3, $4)", [
        userId, provider, providerId, { sub: providerId },
      ]);
    }

    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(file, migrations), "utf8"));
      if (file.endsWith("_marketplace_foundation.sql")) {
        await addWeb3Identity(buyer.id, `web3:ethereum:${buyer.wallet}`);
        expect((await db.query("select wallet from public.users where id = $1", [buyer.id])).rows).toEqual([]);
      }
    }
    expect((await db.query("select wallet from public.users where id = $1", [buyer.id])).rows).toEqual([{ wallet: buyer.wallet }]);
    await db.exec(await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"));

    for (const viewer of Object.values(demoViewers)) {
      if (viewer.id !== buyer.id) await addWeb3Identity(viewer.id, `web3:ethereum:${viewer.wallet}`);
      if (viewer.role !== "USER") {
        await db.query("insert into public.staff_wallets (wallet, role) values ($1, $2)", [viewer.wallet, viewer.role]);
      }
    }
    await addWeb3Identity(otherUserId, "web3:ethereum:0x0000000000000000000000000000000000000099", "google");
    expect((await db.query("select wallet from public.users where id = $1", [otherUserId])).rows).toEqual([]);
    await db.query(`
      insert into public.listings (id, seller_id, game_slug, title, description, quantity, region, delivery_method, price_wei)
      values ($1, $2, 'warframe', 'Mod', 'Demo', 1, 'Asia', 'Trade', '10000000000000000')
    `, [listingId, seller.id]);
    await db.query(`
      insert into public.conversations (id, listing_id, buyer_id, seller_id) values ($1, $2, $3, $4)
    `, [conversationId, listingId, buyer.id, seller.id]);
    await db.query(`
      insert into public.messages (conversation_id, sender_id, kind, body) values ($1, $2, 'USER', 'Demo')
    `, [conversationId, buyer.id]);
    await db.query(`
      insert into public.offers (id, conversation_id, listing_id, buyer_id, seller_id, chain_id, escrow_address,
        chain_order_id, chain_listing_id, amount_wei, agreement, agreement_hash, seller_signature, expires_at)
      values ($1, $2, $3, $4, $5, 31337, $6, $7, $8, '10000000000000000', '{}', $7, $9, now() + interval '30 minutes')
    `, [offerId, conversationId, listingId, buyer.id, seller.id, admin.wallet,
      toChainId(offerId), toChainId(listingId), "0x" + "1".repeat(130)]);
    await db.query(`
      insert into public.orders (id, listing_id, chain_id, escrow_address, status, deadline, funded_at)
      values ($1, $2, 31337, $3, 'FUNDED', now() + interval '24 hours', now())
    `, [offerId, listingId, admin.wallet]);

    await db.exec("set role anon");
    expect((await db.query("select slug, name, category from public.games order by slug")).rows)
      .toEqual([...demoGames].sort((first, second) => first.slug.localeCompare(second.slug)));
    expect((await db.query("select price_wei from public.listings")).rows).toEqual([{ price_wei: "10000000000000000" }]);
    await expect(db.query("select * from public.messages")).rejects.toThrow("permission denied");
    await expect(db.query("select public.open_listing_conversation($1)", [listingId])).rejects.toThrow("permission denied");
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [buyer.id]);
    expect((await db.query("select * from public.get_marketplace_viewer()")).rows).toEqual([buyer]);
    expect((await db.query("select id from public.orders")).rows).toEqual([{ id: offerId }]);
    expect((await db.query("select body from public.messages")).rows).toEqual([{ body: "Demo" }]);
    expect((await db.query("select public.open_listing_conversation($1) as id", [listingId])).rows).toEqual([{ id: conversationId }]);
    expect((await db.query("select * from public.get_conversation_wallets($1)", [conversationId])).rows)
      .toEqual([{ buyer: buyer.wallet, seller: seller.wallet }]);
    await expect(db.query("update public.offers set amount_wei = '1' where id = $1", [offerId])).rejects.toThrow("permission denied");
    await expect(db.query("insert into public.funding_attempts (offer_id, tx_hash) values ($1, $2)", [offerId, toChainId(offerId)]))
      .rejects.toThrow("permission denied");
    const insertMessage = "insert into public.messages (conversation_id, sender_id, kind, body) values ($1, $2, $3, $4) returning body";
    expect((await db.query(insertMessage, [conversationId, buyer.id, "USER", "Still available?"])).rows).toEqual([{ body: "Still available?" }]);
    await expect(db.query(insertMessage, [conversationId, seller.id, "USER", "Forged sender"])).rejects.toThrow("row-level security");
    await expect(db.query(insertMessage, [conversationId, null, "SYSTEM", "Fake system notice"])).rejects.toThrow("row-level security");
    await expect(db.query("update public.messages set body = 'Edited'")).rejects.toThrow("permission denied");
    await expect(db.query("delete from public.messages")).rejects.toThrow("permission denied");
    expect((await db.query("update public.listings set title = 'Other seller' where id = $1 returning id", [listingId])).rows).toEqual([]);
    const insertListing = `insert into public.listings
      (seller_id, game_slug, title, description, quantity, region, delivery_method, price_wei, item_type)
      values ($1, 'warframe', 'New mod', 'Demo', 1, 'Asia', 'Trade', '1', 'Mods') returning id`;
    await expect(db.query(insertListing, [seller.id])).rejects.toThrow("row-level security");
    await expect(db.query("select * from public.evidence")).rejects.toThrow("permission denied");
    await expect(db.query("update public.users set wallet = $1", [superAdmin.wallet])).rejects.toThrow("permission denied");
    await expect(db.query("update public.staff_wallets set role = 'SUPER_ADMIN'")).rejects.toThrow("permission denied");

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
    expect((await db.query("select * from public.get_marketplace_viewer()")).rows).toEqual([admin]);
    expect((await db.query("select id from public.orders")).rows).toEqual([{ id: offerId }]);
    expect((await db.query("select body from public.messages")).rows).toEqual([]);
    expect((await db.query("select * from public.get_conversation_wallets($1)", [conversationId])).rows).toEqual([]);
    await expect(db.query(insertMessage, [conversationId, admin.id, "USER", "Outside the room"])).rejects.toThrow("row-level security");
    await expect(db.query("select public.open_listing_conversation($1)", [listingId])).rejects.toThrow("A trading account is required");
    await expect(db.query(insertListing, [admin.id])).rejects.toThrow("row-level security");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [superAdmin.id]);
    expect((await db.query("select * from public.get_marketplace_viewer()")).rows).toEqual([superAdmin]);

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [seller.id]);
    await expect(db.query("select public.open_listing_conversation($1)", [listingId])).rejects.toThrow("own listing");
    expect((await db.query(insertMessage, [conversationId, seller.id, "USER", "Yes"])).rows).toEqual([{ body: "Yes" }]);
    const created = await db.query<{ id: string }>(insertListing, [seller.id]);
    const createdId = created.rows[0].id;
    expect((await db.query(`update public.listings set title = 'Updated mod', status = 'PAUSED'
      where id = $1 returning title, status`, [createdId])).rows).toEqual([{ title: "Updated mod", status: "PAUSED" }]);
    await expect(db.query("update public.listings set status = 'SOLD' where id = $1", [createdId])).rejects.toThrow("row-level security");
    await expect(db.query("update public.listings set seller_id = $1 where id = $2", [buyer.id, createdId])).rejects.toThrow("permission denied");
    await db.exec("reset role; set role anon");
    expect((await db.query("select id from public.listings where id = $1", [createdId])).rows).toEqual([]);
    await db.exec("reset role; set role authenticated");
    expect((await db.query("update public.listings set status = 'ACTIVE' where id = $1 returning status", [createdId])).rows).toEqual([{ status: "ACTIVE" }]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [buyer.id]);
    const opened = await db.query("select public.open_listing_conversation($1) as id", [createdId]);
    expect(opened.rows).toEqual([{ id: expect.any(String) }]);
    expect((await db.query("select public.open_listing_conversation($1) as id", [createdId])).rows).toEqual(opened.rows);
    await db.exec("reset role; set role service_role");
    await db.query("update public.listings set status = 'SOLD' where id = $1", [createdId]);
    await db.exec("reset role; set role authenticated");
    expect((await db.query("select status from public.listings where id = $1", [createdId])).rows).toEqual([{ status: "SOLD" }]);
    expect((await db.query("select public.open_listing_conversation($1) as id", [createdId])).rows).toEqual(opened.rows);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [seller.id]);
    expect((await db.query("update public.listings set status = 'ACTIVE' where id = $1 returning status", [createdId])).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 20_000);
