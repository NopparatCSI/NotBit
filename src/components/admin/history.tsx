"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditEntry } from "@/lib/admin/queries";
import { actionLabels, formatTime, shortHex } from "@/lib/admin/format";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminEmpty, AdminHeading, AdminPanel } from "./ui";
import { RefreshButton } from "./navigation";

export function ActivityList({ entries }: { entries: AuditEntry[] }) {
  return <ol className="admin-activity-list">{entries.map(entry => {
    const decision = entry.action.startsWith("DECISION");
    const txHash = typeof entry.details.txHash === "string" ? entry.details.txHash : null;
    return <li key={entry.id} className="admin-activity-row">
      <span className="admin-activity-icon"><MarketplaceIcon name={decision ? "shield" : entry.action.startsWith("EVIDENCE") ? "image" : "history"} /></span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold">{actionLabels[entry.action] ?? entry.action}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.staff?.display_name || (entry.details.role === "SUPER_ADMIN" ? "Super Admin" : "Admin")} <span className="font-mono" title={entry.staff?.wallet}>{shortHex(entry.staff?.wallet)}</span></p>
        <div className="flex flex-wrap items-center gap-2">
          {typeof entry.details.refundBuyer === "boolean" && <Badge variant="outline">{entry.details.refundBuyer ? "Refund buyer" : "Pay seller"}</Badge>}
          {typeof entry.details.paused === "boolean" && <Badge variant="outline">{entry.details.paused ? "Pause deposits" : "Resume deposits"}</Badge>}
          {entry.order_id && <Link className="admin-inline-link" href={`/admin/orders/${entry.order_id}`}>View order<MarketplaceIcon name="arrow" /></Link>}
        </div>
        {txHash && <details className="admin-metadata"><summary>Transaction details</summary><p className="break-all font-mono text-xs">{txHash}</p></details>}
      </div>
      <time className="admin-activity-time" dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
    </li>;
  })}</ol>;
}

export function HistoryContent({ entries }: { entries: AuditEntry[] }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const filtered = entries.filter(entry => `${actionLabels[entry.action] ?? entry.action} ${entry.staff?.display_name ?? ""} ${entry.staff?.wallet ?? ""} ${entry.order_id ?? ""}`.toLowerCase().includes(needle));
  return <div className="admin-page-stack">
    <AdminHeading eyebrow="ACCOUNTABILITY" title="Staff history" description="A record of staff access and actions. Review who did what, and open an order for the full context." action={<RefreshButton />} />
    <AdminPanel title="Recorded activity" description="Latest 200 entries · Newest first" action={<Badge variant="outline">{entries.length} entries</Badge>}>
      {entries.length > 0 && <div className="mb-6"><label htmlFor="history-search" className="sr-only">Search activity, staff wallet, or order ID</label><Input id="history-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search activity, wallet, or order ID" /></div>}
      {entries.length === 0 ? <AdminEmpty icon="history" title="No staff activity yet" description="Order reviews, evidence access, and submitted decisions will appear here as staff use the console." />
        : filtered.length === 0 ? <AdminEmpty icon="search" title="No matching activity" description="Try a different action, staff name, wallet address, or order ID." /> : <ActivityList entries={filtered} />}
    </AdminPanel>
    <p className="admin-footnote"><MarketplaceIcon name="shield" />Recorded entries are read-only and cannot be edited or deleted here.</p>
  </div>;
}
