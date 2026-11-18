import Link from "next/link";
import { actionLabels, formatTime, shortHex } from "@/lib/admin/format";
import { listAuditLogs } from "@/lib/admin/queries";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

function detailText(details: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof details.refundBuyer === "boolean") parts.push(details.refundBuyer ? "refund" : "release");
  if (typeof details.paused === "boolean") parts.push(details.paused ? "pause deposits" : "resume deposits");
  if (typeof details.stage === "string") parts.push(details.stage.toLowerCase());
  return parts.join(" · ");
}

// Append-only log of staff access and actions. The database grants insert only, no update or delete.
export default async function StaffHistory() {
  try {
    await requireStaff();
  } catch (error) {
    if (error instanceof ViewerError) return null;
    throw error;
  }
  const entries = await listAuditLogs(200);

  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-4">
      <h1 id="history-heading" className="text-3xl font-semibold tracking-tight">Staff history</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Every evidence view, decision, escalation, and deposit pause by an Admin or Super Admin. Entries cannot be edited or deleted.
      </p>
      {entries.length === 0 ? <p className="text-sm text-muted-foreground">No staff activity yet.</p> : (
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const txHash = typeof entry.details.txHash === "string" ? entry.details.txHash : null;
            const role = entry.details.role === "SUPER_ADMIN" ? "Super Admin" : "Admin";
            const extra = detailText(entry.details);
            return (
              <li key={entry.id} className="grid gap-0.5 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
                <span className="font-semibold">{actionLabels[entry.action] ?? entry.action}{extra && ` · ${extra}`}</span>
                <span className="text-xs text-muted-foreground sm:text-right">{formatTime(entry.created_at)}</span>
                <span className="text-sm text-muted-foreground">
                  {role} {entry.staff?.display_name ?? ""} <span className="font-mono">{shortHex(entry.staff?.wallet)}</span>
                  {entry.order_id && <> · <Link className="underline" href={`/admin/orders/${entry.order_id}`}>Order</Link></>}
                </span>
                {txHash && <span className="font-mono text-xs text-muted-foreground sm:text-right">tx {shortHex(txHash)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}