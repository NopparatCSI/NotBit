import { afterEach, expect, it, vi } from "vitest";
import { demoViewers } from "@marketplace/shared";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, hex } from "./helpers/database";
vi.mock("server-only", () => ({}));
let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db = undefined; });

it("restricts private staging tickets and their reservation RPC to the service role", async () => {
  db = await createDatabase();
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from public.upload_tickets")).rejects.toThrow("permission denied");
    await expect(db.query("select * from public.reserve_upload_ticket($1,'listing',null,'image/png',10,$2)", [demoViewers.seller.id, hex(1)])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const ticket = await db.query<{ id: string; object_path: string }>("select * from public.reserve_upload_ticket($1,'listing',null,'image/png',10,$2)", [demoViewers.seller.id, hex(1)]);
  expect(ticket.rows[0].object_path).toBe(`${demoViewers.seller.id}/${ticket.rows[0].id}`);
  await db.exec("reset role");
  expect((await db.query("select public from storage.buckets where id='upload-staging'")).rows).toEqual([{ public: false }]);
}, 20_000);

it("reserves at most 30 scoped upload tickets per user and allows a single finalization", async () => {
  db = await createDatabase();
  await db.exec("set role service_role");
  let id = "";
  for (let i = 0; i < 30; i++) {
    const result = await db.query<{ id: string }>("select * from public.reserve_upload_ticket($1,'listing',null,'image/png',10,$2)", [demoViewers.seller.id, hex(i)]);
    id = result.rows[0].id;
  }
  await expect(db.query("select * from public.reserve_upload_ticket($1,'listing',null,'image/png',10,$2)", [demoViewers.seller.id, hex(31)])).rejects.toThrow("UPLOAD_QUOTA");
  const claim = "update public.upload_tickets set consumed_at=now() where id=$1 and consumed_at is null returning id";
  expect((await db.query(claim, [id])).rows).toHaveLength(1);
  expect((await db.query(claim, [id])).rows).toHaveLength(0);
}, 20_000);
