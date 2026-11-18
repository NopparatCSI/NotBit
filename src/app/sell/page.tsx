import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/listing-form";
import { Button } from "@/components/ui/button";
import { requireTradeUser, ViewerError } from "@/lib/auth/viewer";
import { listingStatusLabel } from "@/lib/listings/model";
import { ListingError, loadSellerListings } from "@/lib/listings/server";

export const metadata: Metadata = { title: "Sell | NOTBIT" };

async function SellerListings() {
  try {
    const seller = await requireTradeUser();
    const { listings, games } = await loadSellerListings(seller.id);
    return (
      <>
        <nav aria-label="Seller account" className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/sell/orders">Sales orders</Link></Button>
          <Button asChild variant="outline"><Link href="/trade">Messages</Link></Button>
        </nav>
        <section aria-labelledby="new-listing" className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 id="new-listing" className="mb-4 text-xl font-semibold">Create a listing</h2>
          {games.length ? <ListingForm games={games} /> : <p>No games are available for new listings yet.</p>}
        </section>
        <section aria-labelledby="my-listings" className="space-y-3">
          <h2 id="my-listings" className="text-xl font-semibold">My listings</h2>
          {listings.length === 0 && <p className="text-muted-foreground">You have no listings yet.</p>}
          {listings.map((listing) => (
            <details key={listing.id} className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <summary className="cursor-pointer wrap-anywhere font-semibold">
                {listing.title} <span className="font-normal text-muted-foreground">· {listingStatusLabel[listing.status]}</span>
              </summary>
              {listing.status !== "SOLD" && (
                <div className="mt-4 space-y-4">
                  {listing.status === "ACTIVE" && <Link className="underline" href={`/buy/listings/${listing.id}`}>View in marketplace</Link>}
                  <ListingForm games={games} listing={listing} />
                </div>
              )}
            </details>
          ))}
        </section>
      </>
    );
  } catch (error) {
    if (error instanceof ListingError) return <p role="alert">{error.message}</p>;
    if (!(error instanceof ViewerError)) throw error;
    if (error.status === 401) {
      return <Button asChild className="self-start"><Link href="/account">Sign in with MetaMask</Link></Button>;
    }
    return <p role="alert">{error.status === 403 ? "Sign in with a trading account to manage listings." :
      "Account services are unavailable. Check your Supabase configuration."}</p>;
  }
}

export default function SellPage() {
  return (
    <div className="page-width flex flex-col gap-6 py-10 sm:py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">Sell</h1>
      <SellerListings />
    </div>
  );
}
