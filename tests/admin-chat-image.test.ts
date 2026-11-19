import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ staff: vi.fn(), order: vi.fn(), audit: vi.fn(), service: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({ requireStaff: mocks.staff, ViewerError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("@/lib/orders/context", () => ({ loadOrder: mocks.order, writeAudit: mocks.audit, requireService: mocks.service }));
import { ViewerError } from "../src/lib/auth/viewer";
import { GET } from "../src/app/api/v1/admin/orders/[id]/chat/[messageId]/image/route";
const id = "20000000-0000-4000-8000-000000000001", messageId = "40000000-0000-4000-8000-000000000001";
let eq: ReturnType<typeof vi.fn>, query: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ id: "staff" }); mocks.order.mockResolvedValue({ id, conversation_id: "room" }); mocks.audit.mockResolvedValue(undefined);
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { image_path: "private/image.png" }, error: null }) };
  eq = query.eq as typeof eq;
  mocks.service.mockReturnValue({ from: () => query, storage: { from: () => ({ download: mocks.download }) } });
  mocks.download.mockResolvedValue({ data: new Blob(["image"], { type: "image/png" }), error: null });
});
const run = () => GET(new Request("http://localhost/image"), { params: Promise.resolve({ id, messageId }) });
it("scopes staff image reads to the order conversation and audits before download", async () => {
  const r = await run(); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store");
  expect(eq).toHaveBeenCalledWith("conversation_id", "room"); expect(eq).toHaveBeenCalledWith("id", messageId);
  expect(mocks.audit).toHaveBeenCalledWith({ id: "staff" }, id, "CHAT_IMAGE_VIEWED", { messageId });
  expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.download.mock.invocationCallOrder[0]);
});
it("denies non-staff before reading an order or image", async () => {
  mocks.staff.mockRejectedValue(new ViewerError(403, "Forbidden")); expect((await run()).status).toBe(403);
  expect(mocks.order).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
});
it("does not expose an image belonging to another conversation", async () => {
  (query.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  expect((await run()).status).toBe(404); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
});
