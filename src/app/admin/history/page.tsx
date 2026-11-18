import { HistoryContent } from "@/components/admin/history";
import { listAuditLogs } from "@/lib/admin/queries";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export default async function StaffHistory() {
  try { await requireStaff(); }
  catch (error) { if (error instanceof ViewerError) return null; throw error; }
  return <HistoryContent entries={await listAuditLogs(200)} />;
}
