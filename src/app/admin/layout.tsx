import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, ViewerError } from "@/lib/auth/viewer";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { AdminShell } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { AdminAutoRefresh } from "@/components/admin/auto-refresh";

export const metadata: Metadata = { title: "Staff console | NOTBIT", robots: { index: false } };
export const dynamic = "force-dynamic";

function AccessNotice({ message }: { message: string }) {
  return <div className="page-width admin-access">
    <div className="admin-access-mark"><MarketplaceIcon name="shield" /></div>
    <p className="admin-eyebrow">NOTBIT OPERATIONS</p><h1 className="admin-title">Staff console</h1>
    <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
    <Button asChild><Link href="/account"><MarketplaceIcon name="wallet" data-icon="inline-start" />Go to Wallet</Link></Button>
    <p className="text-xs text-muted-foreground">Staff wallets only · Sepolia testnet</p>
  </div>;
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!getSupabaseConfig()) return <AccessNotice message="The staff console is not available yet. Please contact the project administrator." />;
  let staff;
  try { staff = await requireStaff(); }
  catch (error) {
    if (!(error instanceof ViewerError)) throw error;
    return <AccessNotice message={error.status === 401 ? "Connect and sign in with your staff wallet to review orders, inspect evidence, and manage disputes."
      : error.status === 403 ? "This wallet does not have staff access. Switch to an Admin or Super Admin wallet to continue." : error.message} />;
  }
  return <AdminShell role={staff.role as "ADMIN" | "SUPER_ADMIN"} wallet={staff.wallet}><AdminAutoRefresh />{children}</AdminShell>;
}
