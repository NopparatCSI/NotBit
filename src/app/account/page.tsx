import Link from "next/link";
import { WalletAccount } from "@/components/wallet-account";
import { PendingPayout } from "@/components/pending-payout";
import { Button } from "@/components/ui/button";
import { requireViewer, ViewerError } from "@/lib/auth/viewer";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { listingIdSchema } from "@/lib/listings/model";
import type { Viewer } from "@marketplace/shared";

export default async function Account({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { returnTo } = await searchParams;
  const listingPath = "/buy/listings/";
  const destination = typeof returnTo === "string" && (
    ["/trade", "/buy", "/sell/orders"].includes(returnTo) ||
    (returnTo.startsWith(listingPath) && listingIdSchema.safeParse(returnTo.slice(listingPath.length)).success)
  ) ? returnTo : undefined;
  let viewer: Viewer | null = null;
  let message = "";
  if (getSupabaseConfig()) {
    try {
      viewer = await requireViewer();
    } catch (error) {
      if (!(error instanceof ViewerError)) throw error;
      if (error.status !== 401) message = error.message;
    }
  }
  return (
    <div className="page-width flex flex-col gap-6 py-12 sm:py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Wallet account</h1>
      {message && <p role="alert" className="text-destructive">{message}</p>}
      <WalletAccount viewer={viewer} returnTo={destination}>
        {viewer?.role === "USER" && (
          <nav aria-label="Trading account" className="flex flex-wrap gap-2">
            {destination?.startsWith(listingPath) && <Button asChild variant="outline"><Link href={destination}>Back to listing</Link></Button>}
            <Button asChild variant="outline"><Link href="/trade">Messages</Link></Button>
            <Button asChild variant="outline"><Link href="/buy">Purchases</Link></Button>
            <Button asChild variant="outline"><Link href="/sell/orders">Sales orders</Link></Button>
          </nav>
        )}
      </WalletAccount>
      {viewer && <PendingPayout key={viewer.wallet} wallet={viewer.wallet} />}
    </div>
  );
}
