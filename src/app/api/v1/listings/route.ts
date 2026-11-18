import { requireTradeUser } from "@/lib/auth/viewer";
import { createListingSchema, gameSlugSchema } from "@/lib/listings/model";
import { createListing, listActiveListings, ListingError, listingResponse } from "@/lib/listings/server";
import { readListingSubmission } from "@/lib/listings/submission";

export function GET(request: Request) {
  return listingResponse(async () => {
    const game = new URL(request.url).searchParams.get("gameSlug");
    if (game === null) return listActiveListings();

    const slug = gameSlugSchema.safeParse(game);
    if (!slug.success) throw new ListingError(400, "INVALID_INPUT", "Invalid game slug.");
    return listActiveListings(slug.data);
  });
}

export function POST(request: Request) {
  return listingResponse(async () => {
    const seller = await requireTradeUser();
    const { input, image } = await readListingSubmission(request, createListingSchema);
    return createListing(seller.id, input, image);
  }, 201);
}
