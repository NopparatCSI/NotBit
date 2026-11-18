import type { ReactNode } from "react";
import { shortHex } from "@/lib/admin/format";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { AdminNavigation } from "./navigation";

export function AdminShell({ role, wallet, children }: { role: "ADMIN" | "SUPER_ADMIN"; wallet: string; children: ReactNode }) {
  return <div className="page-width admin-console">
    <aside className="admin-sidebar">
      <div className="admin-sidebar-heading"><span className="admin-brand-icon"><MarketplaceIcon name="shield" /></span><div><p className="font-semibold">Staff console</p><p className="text-xs text-muted-foreground">NOTBIT operations</p></div></div>
      <AdminNavigation superAdmin={role === "SUPER_ADMIN"} />
      <div className="admin-sidebar-footer"><Badge variant="outline">{role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</Badge><p className="font-mono text-xs text-muted-foreground" title={wallet}>{shortHex(wallet)}</p><p className="text-xs leading-relaxed text-muted-foreground">Sepolia testnet<br />No real funds</p></div>
    </aside>
    <div className="admin-content">{children}</div>
  </div>;
}
