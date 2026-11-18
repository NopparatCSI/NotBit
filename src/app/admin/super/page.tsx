import { SuperAdminContent } from "@/components/admin/super-admin";
import { AdminEmpty } from "@/components/admin/ui";
import { getEscrowOverview } from "@/lib/admin/queries";
import { requireSuperAdmin, ViewerError } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export default async function SuperAdmin() {
  let viewer;
  try { viewer = await requireSuperAdmin(); }
  catch (error) {
    if (!(error instanceof ViewerError)) throw error;
    if (error.status !== 403) return null;
    return <AdminEmpty icon="shield" title="Super Admin access required" description="Your current wallet can review orders. Switch to the Super Admin wallet to manage new deposits." />;
  }
  return <SuperAdminContent overview={await getEscrowOverview()} wallet={viewer.wallet} />;
}
