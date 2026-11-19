import { beforeAll, describe, expect, test } from "vitest";
import { api, login, sessions, createDeal, fund, evidence, service, record, type Deal } from "./environment";

describe.sequential("16 real Web3 sessions, API and Storage permissions", () => {
  let deal: Deal;
  beforeAll(async () => { for (const person of ["buyer", "seller", "admin", "superAdmin", "outsider"] as const) await login(person); });
  test("database roles come from verified wallets, not user metadata", async () => {
    for (const person of ["buyer", "seller", "outsider", "admin", "superAdmin"] as const) {
      const result = await api(person, "/me");
      expect(result.status).toBe(200);
      expect(result.data.role).toBe(person === "admin" ? "ADMIN" : person === "superAdmin" ? "SUPER_ADMIN" : "USER");
    }
    expect((await api(null, "/me")).status).toBe(401);
    await sessions.outsider.auth.auth.updateUser({ data: { role: "SUPER_ADMIN" } });
    expect((await api("outsider", "/me")).data.role).toBe("USER");
  });
  test("trading and staff APIs enforce role and ownership", async () => {
    deal = await createDeal("permissions");
    expect((await api("outsider", `/listings/${deal.listing.id}`, "PATCH", { title: "stolen" })).status).toBe(404);
    expect((await api("seller", "/conversations", "POST", { listingId: deal.listing.id })).status).toBe(409);
    expect((await api("outsider", `/conversations/${deal.conversationId}/messages`)).status).toBe(404);
    expect((await api("admin", `/conversations/${deal.conversationId}/messages`)).status).toBe(403);
    expect((await api("buyer", `/admin/orders/${deal.offer.id}/chat`)).status).toBe(403);
    expect((await api("admin", "/listings", "POST", {})).status).toBe(403);
    expect((await api("admin", "/admin/activity", "POST", { action: "FUNDING_PAUSE_SUBMITTED", paused: true, txHash: `0x${"1".repeat(64)}` })).status).toBe(403);
  });
  test("real deposited order and private evidence reject outsiders and wrong stages", async () => {
    await fund(deal);
    const path = `/orders/${deal.offer.id}/evidence`;
    expect((await api(null, path)).status).toBe(401);
    expect((await api("outsider", path)).status).toBe(404);
    expect((await api("admin", path, "POST", {})).status).toBe(403);
    expect((await api("buyer", path, "POST", { stage: "delivery", ticketIds: [crypto.randomUUID()] })).status).toBe(403);
    expect((await api("buyer", path, "POST", { stage: "receipt", ticketIds: [crypto.randomUUID()] })).status).toBe(409);
    const uploaded = await evidence("seller", deal, "delivery");
    const file = `${path}/${uploaded.evidence[0].id}`;
    expect((await api("outsider", file)).status).toBe(404);
    expect((await api("buyer", `${file}?verify=1`)).status).toBe(403);
    expect((await api("admin", `${file}?verify=1`)).data.matches).toBe(true);
    expect((await api("superAdmin", `${file}?verify=1`)).data.matches).toBe(true);
    const signed = await api("buyer", file);
    expect(signed.status).toBe(200);
    expect((await fetch(signed.data.url)).status).toBe(200);
    const row = await service.from("evidence").select("object_path").eq("id", uploaded.evidence[0].id).single();
    expect((await sessions.outsider.auth.storage.from("order-evidence").download(row.data!.object_path)).error).not.toBeNull();
  });
  test("direct database access cannot forge staff, wallet, system messages or service operations", async () => {
    const db = sessions.outsider.auth;
    expect((await db.from("staff_wallets").insert({ wallet: (await api("outsider", "/me")).data.wallet, role: "SUPER_ADMIN" })).error).not.toBeNull();
    expect((await db.from("messages").insert({ conversation_id: deal.conversationId, kind: "SYSTEM", sender_id: null, body: "fake refund" })).error).not.toBeNull();
    expect((await db.rpc("reserve_evidence_quota", { p_user: sessions.outsider.id, p_count: 1 })).error).not.toBeNull();
    expect((await db.rpc("indexer_rewind", { p_chain_id: 31337, p_escrow: deal.offer.escrowAddress, p_expected_block: "1", p_ancestor_block: "0", p_ancestor_hash: null })).error).not.toBeNull();
    record("16", { passed: true, roles: 5, orderId: deal.offer.id });
  });
});
