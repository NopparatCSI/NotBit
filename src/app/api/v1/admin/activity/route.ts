import { z } from "zod";
import { bytes32Schema } from "@marketplace/shared";
import { readJson } from "@/lib/api/body";
import { ApiError, handle, ok } from "@/lib/api/response";
import { requireStaff } from "@/lib/auth/viewer";
import { recordStaffTransaction } from "@/lib/admin/transactions";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DECISION_SUBMITTED"), orderId: z.uuid(), txHash: bytes32Schema }),
  z.object({ action: z.literal("ESCALATION_SUBMITTED"), orderId: z.uuid(), txHash: bytes32Schema }),
  z.object({ action: z.literal("FUNDING_PAUSE_SUBMITTED"), paused: z.boolean(), txHash: bytes32Schema }),
]);

// Records transactions that staff sent from their own wallets, so the staff history links
// each action to its on-chain transaction. The indexer stays the source of the result.
export function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff();
    const body = await readJson(request, bodySchema);
    if (body.action === "FUNDING_PAUSE_SUBMITTED") {
      if (staff.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only the Super Admin can pause deposits.");
      await recordStaffTransaction(staff, body);
      return ok({ recorded: true }, 201);
    }
    await recordStaffTransaction(staff, body);
    return ok({ recorded: true }, 201);
  });
}
