import { beforeEach, expect, it, vi } from "vitest";
import type { OrderOverview } from "../src/lib/orders/context";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/lib/orders/context", () => ({ requireService: mocks.service }));
import { getConversation } from "../src/lib/admin/queries";
const uuid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const timestamp = "2026-11-19T00:00:00+00:00";
const rows = (top: number) => Array.from({ length: 51 }, (_, i) => ({ id: uuid(top-i), sender_id: "buyer", kind: "USER", body: String(top-i), created_at: timestamp, image_path: i === 0 ? "private/image" : null }));
const order = { conversation_id: "room", buyer_id: "buyer" } as OrderOverview;
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn>; then: (resolve: (v: unknown) => unknown) => unknown };
let pageRows = rows(550);
beforeEach(() => {
  vi.clearAllMocks(); pageRows = rows(550);
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { created_at: timestamp }, error: null }), then: resolve => resolve({ data: pageRows, error: null }) };
  mocks.service.mockReturnValue({ from: () => query });
});
it("shows newest messages beyond 500 and uses timestamp/id keyset pagination without duplicates", async () => {
  const first = await getConversation(order);
  expect(first.messages[0].body).toBe("501"); expect(first.messages.at(-1)?.body).toBe("550");
  expect(first.messages.at(-1)?.hasImage).toBe(true); expect(first.nextBefore).toBe(uuid(501));
  expect(query.limit).toHaveBeenCalledWith(51);
  pageRows = rows(500);
  const earlier = await getConversation(order, first.nextBefore!);
  expect(query.eq).toHaveBeenCalledWith("conversation_id", "room"); expect(query.eq).toHaveBeenCalledWith("id", uuid(501));
  expect(query.or).toHaveBeenCalledWith(`created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${uuid(501)})`);
  expect(new Set([...earlier.messages,...first.messages].map(m => m.id)).size).toBe(100);
});
it("rejects cursors from outside the order conversation", async () => {
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(getConversation(order, uuid(1))).rejects.toThrow("not found"); expect(query.or).not.toHaveBeenCalled();
});
