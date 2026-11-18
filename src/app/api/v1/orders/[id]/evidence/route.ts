import { keccak256, type Address, type Hex } from "viem";
import { evidenceStages, hashEvidence, type EvidenceReceipt } from "@marketplace/shared";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireTradeUser } from "@/lib/auth/viewer";
import { getEscrowConfig, matchesEscrow } from "@/lib/chain/config";
import { createChainEscrowReader } from "@/lib/chain/escrow-reader";
import {
  checkEvidenceFile, dbStage, extensionFor, maxFilesPerUpload, parseStage, uploadRateLimit, uploadRule,
  type EvidenceItem, type EvidenceStageName, type ImageType,
} from "@/lib/evidence/files";
import { signEvidenceReceipt } from "@/lib/evidence/signer";
import { loadOrder, partyOf, requireOrderAccess, requireService, type OrderOverview } from "@/lib/orders/context";

export const runtime = "nodejs";
const bucket = "order-evidence";

type Params = { params: Promise<{ id: string }> };

type EvidenceRow = {
  id: string; stage: EvidenceItem["stage"]; submitted_by: string; file_hash: string;
  content_type: string; size_bytes: number; created_at: string;
};

function toItem(row: EvidenceRow, order: OrderOverview): EvidenceItem {
  return {
    id: row.id, stage: row.stage, submittedBy: row.submitted_by === order.buyer_id ? "BUYER" : "SELLER",
    fileHash: row.file_hash, contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at,
  };
}

// Lists evidence metadata for the counterparties and staff. Files are opened one at a time
// through /evidence/:evidenceId so staff access can be logged first.
export function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const { order } = await requireOrderAccess(id);
    const { data, error } = await requireService().from("evidence")
      .select("id, stage, submitted_by, file_hash, content_type, size_bytes, created_at")
      .eq("order_id", order.id).order("created_at").order("id");
    if (error) throw new ApiError(503, "UNAVAILABLE", "Could not load evidence. Try again.");
    return ok({ evidence: (data as EvidenceRow[]).map((row) => toItem(row, order)) });
  });
}

// Confirms the contract still allows this step. RPC failures fall back to the projection
// because the contract checks the receipt, caller, stage, and deadline again.
async function checkChainState(order: OrderOverview, stage: EvidenceStageName) {
  const config = getEscrowConfig();
  if (!config || !matchesEscrow(config, order.chain_id, order.escrow_address)) return;
  let chainOrder;
  try {
    chainOrder = await createChainEscrowReader(config).getChainOrder(order.chain_order_id);
  } catch {
    return;
  }
  const rule = uploadRule(stage);
  if (!chainOrder || !rule.statuses.includes(chainOrder.status)) {
    throw new ApiError(409, "CONFLICT", "The order has moved on. Refresh the page to see its current status.");
  }
  if (rule.beforeDeadline && chainOrder.deadline * 1000 <= Date.now()) {
    throw new ApiError(409, "CONFLICT", "The deadline for this step has passed. The order will go to staff review.");
  }
}

export function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const viewer = await requireTradeUser();
    const order = await loadOrder(id);
    const party = partyOf(viewer, order);
    if (!party) throw new ApiError(404, "NOT_FOUND", "Order not found.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Send evidence as multipart form data.");
    }
    const stage = parseStage(form.get("stage"));
    if (!stage) throw new ApiError(400, "INVALID_INPUT", "Choose an evidence stage: delivery, receipt, or dispute.");

    const rule = uploadRule(stage);
    if (!rule.parties.includes(party)) {
      throw new ApiError(403, "FORBIDDEN", stage === "delivery"
        ? "Only the seller can add delivery evidence." : "Only the buyer can add receipt evidence.");
    }
    if (!rule.statuses.includes(order.status)) {
      throw new ApiError(409, "CONFLICT", "This order is not at a step that accepts this evidence.");
    }
    if (rule.beforeDeadline && new Date(order.deadline).getTime() <= Date.now()) {
      throw new ApiError(409, "CONFLICT", "The deadline for this step has passed. The order will go to staff review.");
    }

    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length === 0) throw new ApiError(400, "INVALID_INPUT", "Attach at least one image.");
    if (files.length > maxFilesPerUpload) {
      throw new ApiError(400, "INVALID_INPUT", `Attach up to ${maxFilesPerUpload} images at a time.`);
    }

    const supabase = requireService();
    const since = new Date(Date.now() - uploadRateLimit.windowMinutes * 60_000).toISOString();
    const recent = await supabase.from("evidence").select("id", { count: "exact", head: true })
      .eq("submitted_by", viewer.id).gte("created_at", since);
    if (recent.error) throw new ApiError(503, "UNAVAILABLE", "Could not check upload limits. Try again.");
    if ((recent.count ?? 0) + files.length > uploadRateLimit.files) {
      throw new ApiError(429, "UNAVAILABLE", `Upload limit reached. Try again in ${uploadRateLimit.windowMinutes} minutes.`);
    }

    const prepared: { id: string; bytes: Uint8Array; type: ImageType; hash: Hex; path: string }[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkEvidenceFile(file.name || "Image", file.type, bytes);
      if (!check.ok) throw new ApiError(400, "INVALID_INPUT", check.message);
      const evidenceId = crypto.randomUUID();
      prepared.push({
        id: evidenceId, bytes, type: check.type, hash: keccak256(bytes),
        // A new path per file. Uploads never overwrite (upsert: false).
        path: `${order.id}/${stage}/${evidenceId}.${extensionFor(check.type)}`,
      });
    }

    if (stage !== "dispute") await checkChainState(order, stage);

    const uploaded: string[] = [];
    try {
      for (const file of prepared) {
        const { error } = await supabase.storage.from(bucket)
          .upload(file.path, file.bytes, { contentType: file.type, upsert: false });
        if (error) throw new ApiError(503, "UNAVAILABLE", "Could not store the image. Try again.");
        uploaded.push(file.path);
      }

      const { data: rows, error } = await supabase.from("evidence").insert(prepared.map((file) => ({
        id: file.id, order_id: order.id, submitted_by: viewer.id, stage: dbStage[stage], object_path: file.path,
        file_hash: file.hash, content_type: file.type, size_bytes: file.bytes.length,
      }))).select("id, stage, submitted_by, file_hash, content_type, size_bytes, created_at");
      if (error) throw new ApiError(503, "UNAVAILABLE", "Could not record the evidence. Try again.");

      let receipt: EvidenceReceipt | null = null;
      if (stage !== "dispute") {
        receipt = await signEvidenceReceipt({
          chainId: order.chain_id,
          escrowAddress: order.escrow_address as Address,
          orderId: order.chain_order_id,
          submitter: viewer.wallet,
          stage: evidenceStages[stage],
          // hashEvidence keeps the upload order, which evidence_ids records.
          evidenceHash: hashEvidence(prepared.map((file) => file.hash)),
        });
        const saved = await supabase.from("evidence_receipts").insert({
          order_id: order.id, submitted_by: viewer.id, submitter_wallet: viewer.wallet, stage: dbStage[stage],
          evidence_ids: prepared.map((file) => file.id), evidence_hash: receipt.evidenceHash,
          signature: receipt.signature.toLowerCase(),
        });
        if (saved.error) throw new ApiError(503, "UNAVAILABLE", "Could not record the evidence receipt. Try again.");
      }

      const byId = new Map((rows as EvidenceRow[]).map((row) => [row.id, row]));
      const evidence = prepared.map((file) => toItem(byId.get(file.id)!, order));
      return ok({ evidence, receipt }, 201);
    } catch (error) {
      // Rows may already reference the files, so only clean up when nothing was recorded.
      const recorded = await supabase.from("evidence").select("id", { count: "exact", head: true })
        .in("id", prepared.map((file) => file.id));
      if (!recorded.error && recorded.count === 0 && uploaded.length) {
        await supabase.storage.from(bucket).remove(uploaded);
      }
      throw error;
    }
  });
}