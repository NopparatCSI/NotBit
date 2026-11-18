import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEther } from "viem";
import { demoCatalog } from "@/components/demo-catalog";
import { StartConversation } from "@/components/start-conversation";
import { Button } from "@/components/ui/button";
import { listingIdSchema } from "@/lib/listings/model";
import { findActiveListing, ListingError } from "@/lib/listings/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const configured = Boolean(getSupabaseConfig());
  const demoGame = configured ? undefined : demoCatalog.find((game) => game.listings[0]?.id === id);
  const sample = demoGame?.listings[0];
  let listing = null;
  if (configured && listingIdSchema.safeParse(id).success) {
    try {
      listing = await findActiveListing(id);
    } catch (error) {
      if (!(error instanceof ListingError)) throw error;
      return <div className="page-width py-12"><p role="alert">{error.message}</p></div>;
    }
  }

  if (!listing && !sample) notFound();

  const title = listing?.title ?? sample?.name;
  const game = listing ? demoCatalog.find(({ slug }) => slug === listing.gameSlug)?.name ?? listing.gameSlug : demoGame?.name;
  const itemType = listing?.itemType ?? sample?.type;
  const image = listing?.imageUrl ?? sample?.artwork;
  const price = listing ? formatEther(BigInt(listing.priceWei)) : sample?.price;

  return (
    <article className="page-width flex flex-col gap-6 py-10 sm:py-16">
      <Button asChild variant="outline" className="self-start"><Link href="/#marketplace">Back to the marketplace</Link></Button>
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-10">
        {image && (
          <div className="store-item-art rounded-lg">
            <Image src={image} alt="" fill unoptimized={typeof image === "string"} sizes="(min-width: 640px) 50vw, 100vw" />
          </div>
        )}
        <div className={`min-w-0 space-y-4 wrap-anywhere ${image ? "" : "sm:col-span-2"}`}>
          <p className="text-muted-foreground">{game}{itemType && ` · ${itemType}`}</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="text-xl font-semibold">{price} Sepolia ETH</p>
          {listing ? (
            <>
              <p className="whitespace-pre-wrap">{listing.description}</p>
              <dl className="grid gap-3 rounded-lg border border-border bg-card p-4">
                <div><dt className="text-muted-foreground">Quantity</dt><dd>{listing.quantity}</dd></div>
                <div><dt className="text-muted-foreground">Server or region</dt><dd>{listing.region}</dd></div>
                <div><dt className="text-muted-foreground">Delivery method</dt><dd>{listing.deliveryMethod}</dd></div>
              </dl>
              <StartConversation listingId={listing.id} />
            </>
          ) : <p className="text-muted-foreground">Sample listing</p>}
        </div>
      </div>
    </article>
  );
}
