import { keccak256 } from "viem";
import { z } from "zod";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireOrderAccess, requireService, writeAudit } from "@/lib/orders/context";

export const runtime = "nodejs";
const signedUrlSeconds = 60;

type Params = { params: Promise<{ id: string; evidenceId: string }> };

// Returns a short-lived signed URL for one evidence image. Staff access is written to
// audit_logs before the URL is created. ?verify=1 re-hashes the stored file (staff only).
export function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { id, evidenceId } = await params;
    if (!z.uuid().safeParse(evidenceId).success) throw new ApiError(404, "NOT_FOUND", "Evidence not found.");
    const { viewer, order, isStaff } = await requireOrderAccess(id);
    const supabase = requireService();

    const { data: row, error } = await supabase.from("evidence")
      .select("id, order_id, object_path, file_hash, stage").eq("id", evidenceId.toLowerCase()).maybeSingle();
    if (error) throw new ApiError(503, "UNAVAILABLE", "Could not load evidence. Try again.");
    if (!row || row.order_id !== order.id) throw new ApiError(404, "NOT_FOUND", "Evidence not found.");

    const verify = new URL(request.url).searchParams.get("verify") === "1";
    if (verify && !isStaff) throw new ApiError(403, "FORBIDDEN", "Only staff can verify evidence hashes.");
    if (isStaff) {
      await writeAudit(viewer, order.id, verify ? "EVIDENCE_VERIFIED" : "EVIDENCE_VIEWED", { evidenceId: row.id, stage: row.stage });
    }

    if (verify) {
      const file = await supabase.storage.from("order-evidence").download(row.object_path);
      if (file.error || !file.data) throw new ApiError(503, "UNAVAILABLE", "Could not read the stored file. Try again.");
      const actual = keccak256(new Uint8Array(await file.data.arrayBuffer()));
      return ok({ evidenceId: row.id, expectedHash: row.file_hash, actualHash: actual, matches: actual === row.file_hash });
    }

    const signed = await supabase.storage.from("order-evidence").createSignedUrl(row.object_path, signedUrlSeconds);
    if (signed.error || !signed.data) throw new ApiError(503, "UNAVAILABLE", "Could not open the file. Try again.");
    return ok({
      evidenceId: row.id,
      url: signed.data.signedUrl,
      expiresAt: new Date(Date.now() + signedUrlSeconds * 1000).toISOString(),
    });
  });
}