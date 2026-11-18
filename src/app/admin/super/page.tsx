import { FundingPauseToggle } from "@/components/admin/staff-actions";
import { formatEth, formatTime } from "@/lib/admin/format";
import { getEscrowOverview } from "@/lib/admin/queries";
import { requireSuperAdmin, ViewerError } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

const roleLabels = { ADMIN: "Admin", SUPER_ADMIN: "Super Admin" } as const;

export default async function SuperAdmin() {
  let viewer;
  try {
    viewer = await requireSuperAdmin();
  } catch (error) {
    if (!(error instanceof ViewerError)) throw error;
    if (error.status !== 403) return null;
    return <p role="alert" className="text-muted-foreground">Only the Super Admin can open this page.</p>;
  }
  const overview = await getEscrowOverview();
  const paused = overview.chain?.fundingPaused ?? overview.projectedPaused;
  const onChainRole = (wallet: string) =>
    !overview.chain ? "Unknown (RPC unavailable)"
      : wallet === overview.chain.superAdmin ? "Super Admin on contract"
        : wallet === overview.chain.admin ? "Admin on contract" : "Not set on contract";

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="deposits-heading" className="flex flex-col gap-3">
        <h1 id="deposits-heading" className="text-3xl font-semibold tracking-tight">Super Admin</h1>
        <h2 className="text-xl font-semibold">New deposits</h2>
        {!overview.config ? (
          <p className="text-sm text-muted-foreground">Set NEXT_PUBLIC_ESCROW_ADDRESS and an RPC URL to manage the escrow.</p>
        ) : (
          <>
            <p role="status" className="text-sm">
              {paused ? "Paused. Buyers cannot fund new offers." : "Open. Buyers can fund new offers."}
              {!overview.chain && <span className="text-muted-foreground"> (from the last indexed event; the RPC is unavailable)</span>}
            </p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Pausing affects new deposits only. Existing orders can still be delivered, received, disputed, decided, and withdrawn.
            </p>
            <FundingPauseToggle paused={paused} chainId={overview.config.chainId}
              escrowAddress={overview.config.escrowAddress} staffWallet={viewer.wallet} />
          </>
        )}
      </section>

      <section aria-labelledby="staff-heading" className="flex flex-col gap-3">
        <h2 id="staff-heading" className="text-xl font-semibold">Staff wallets</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Roles are set when the escrow is deployed and cannot be changed in this release. The web role and the contract role must match.
        </p>
        <ul className="flex flex-col">
          {overview.staff.map((member) => (
            <li key={member.wallet} className="grid gap-0.5 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
              <span className="font-mono text-sm break-all">{member.wallet}</span>
              <span className="text-sm sm:text-right">{roleLabels[member.role]}</span>
              <span className="text-xs text-muted-foreground">Registered {formatTime(member.created_at)}</span>
              <span className="text-xs text-muted-foreground sm:text-right">{onChainRole(member.wallet)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="payouts-heading" className="flex flex-col gap-3">
        <h2 id="payouts-heading" className="text-xl font-semibold">Queued payouts</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Payments that could not be sent automatically. Only the recipient wallet can withdraw them with withdrawPendingPayout.
        </p>
        {overview.payouts.length === 0 ? <p className="text-sm text-muted-foreground">No queued payouts.</p> : (
          <ul className="flex flex-col">
            {overview.payouts.map((payout) => (
              <li key={payout.wallet} className="flex flex-wrap justify-between gap-2 border-b border-border py-3">
                <span className="font-mono text-sm break-all">{payout.wallet}</span>
                <span className="text-sm">{formatEth(payout.pending_wei)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}