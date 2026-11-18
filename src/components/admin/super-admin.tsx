import type { getEscrowOverview } from "@/lib/admin/queries";
import { formatEth, formatTime } from "@/lib/admin/format";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminEmpty, AdminHeading, AdminPanel } from "./ui";
import { FundingPauseToggle } from "./staff-actions";
import { RefreshButton } from "./navigation";

export function SuperAdminContent({ overview, wallet }: { overview: Awaited<ReturnType<typeof getEscrowOverview>>; wallet: string }) {
  const paused = overview.chain?.fundingPaused ?? overview.projectedPaused;
  const known = Boolean(overview.chain || overview.projectionAvailable);
  const roleLabels = { ADMIN: "Admin", SUPER_ADMIN: "Super Admin" } as const;
  return <div className="admin-page-stack">
    <AdminHeading eyebrow="ESCROW CONTROLS" title="Super Admin" description="Manage new deposits and check staff access. Existing orders remain protected in escrow." action={<RefreshButton />} />
    <AdminPanel title="New deposits" description="Control whether buyers can fund new offers." action={<Badge variant={!known ? "outline" : paused ? "warning" : "success"}>{!known ? "Status unavailable" : paused ? "Paused" : "Accepting deposits"}</Badge>}>
      <div className="admin-funding-content">
        <div className="flex flex-col gap-3"><span className="admin-control-icon"><MarketplaceIcon name="wallet" /></span>
          <h3 className="text-lg font-semibold">{!known ? "Check escrow status" : paused ? "New deposits are paused" : "Open for new deposits"}</h3>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">Delivery, receipt, disputes, staff decisions, and payout withdrawals remain available when deposits are paused.</p>
          <p className="text-xs text-muted-foreground">{overview.chain ? "Status verified on-chain" : known ? "Last indexed status · Live connection unavailable" : "The live escrow status could not be verified. Refresh before making a change."}</p>
        </div>
        {overview.config && known ? <FundingPauseToggle paused={paused} chainId={overview.config.chainId} escrowAddress={overview.config.escrowAddress} staffWallet={wallet} />
          : <Alert><MarketplaceIcon name="info" /><AlertTitle>Controls unavailable</AlertTitle><AlertDescription>Ask the project administrator to check the escrow connection, then refresh this page.</AlertDescription></Alert>}
      </div>
    </AdminPanel>
    <div className="admin-settings-grid">
      <AdminPanel title="Staff wallets" description="Compare console access with the roles on the contract." action={<Badge variant="outline">{overview.staff.length} wallets</Badge>}>
        {overview.staff.length === 0 ? <AdminEmpty icon="shield" title="No staff wallets registered" description="Contact the project administrator to check staff access for this environment." /> : <ul className="admin-wallet-list">
          {overview.staff.map(member => {
            const matches = overview.chain && (member.role === "SUPER_ADMIN" ? member.wallet === overview.chain.superAdmin : member.wallet === overview.chain.admin);
            return <li key={member.wallet}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-sm">{roleLabels[member.role]}</span><Badge variant={!overview.chain ? "outline" : matches ? "success" : "warning"}>{!overview.chain ? "Not verified" : matches ? "Roles match" : "Role mismatch"}</Badge></div>
              <p className="break-all font-mono text-xs leading-relaxed text-muted-foreground">{member.wallet}</p><p className="text-xs text-muted-foreground">Registered {formatTime(member.created_at)}</p></li>;
          })}
        </ul>}
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Roles were fixed when this escrow was deployed. They cannot be changed in this release.</p>
      </AdminPanel>
      <AdminPanel title="Queued payouts" description="Payments that could not be delivered automatically." action={<Badge variant="outline">{overview.payouts.length} wallets</Badge>}>
        {overview.payouts.length === 0 ? <AdminEmpty icon="wallet" title="No payouts waiting" description="If a payment cannot be delivered, the recipient's pending balance will appear here." />
          : <ul className="admin-wallet-list">{overview.payouts.map(payout => <li key={payout.wallet}><p className="admin-money">{formatEth(payout.pending_wei)}</p><p className="break-all font-mono text-xs text-muted-foreground">{payout.wallet}</p></li>)}</ul>}
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Only the recipient wallet can withdraw its pending balance.</p>
      </AdminPanel>
    </div>
  </div>;
}
