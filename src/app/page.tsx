import { formatEther } from "viem";
import { demoCatalog } from "@/components/demo-catalog";
import { GameCatalog } from "@/components/game-catalog";
import type { Listing } from "@/lib/listings/model";
import { ListingError, listActiveListings } from "@/lib/listings/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export default async function Home() {
  if (!getSupabaseConfig()) return <GameCatalog games={demoCatalog} initialGame="warframe" />;

  let listings: Listing[] = [];
  let error: string | undefined;
  try {
    listings = await listActiveListings();
  } catch (failure) {
    if (!(failure instanceof ListingError)) throw failure;
    error = failure.message;
  }

  const games = demoCatalog.map((game) => {
    const cards = listings.filter((listing) => listing.gameSlug === game.slug).map((listing) => ({
      id: listing.id,
      name: listing.title,
      type: listing.itemType,
      price: formatEther(BigInt(listing.priceWei)),
      artwork: listing.imageUrl,
    }));
    const itemTypes = [...new Set(cards.flatMap(({ type }) => type ? [type] : []))];
    return { ...game, itemTypes, listings: cards };
  });

  return <GameCatalog games={games} initialGame="warframe" live error={error} />;
}
