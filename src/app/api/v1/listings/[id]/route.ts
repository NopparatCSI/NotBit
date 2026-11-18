import { requireTradeUser } from "@/lib/auth/viewer";
import { listingIdSchema, updateListingSchema } from "@/lib/listings/model";
import { findActiveListing, ListingError, listingResponse, updateListing } from "@/lib/listings/server";
import { readListingSubmission } from "@/lib/listings/submission";

type ListingRoute = { params: Promise<{ id: string }> };

function requireListingId(id: string) {
  if (!listingIdSchema.safeParse(id).success) {
    throw new ListingError(404, "NOT_FOUND", "Listing not found.");
  }
  return id;
}

export function GET(_request: Request, { params }: ListingRoute) {
  return listingResponse(async () => {
    const id = requireListingId((await params).id);
    const listing = await findActiveListing(id);
    if (!listing) throw new ListingError(404, "NOT_FOUND", "Active listing not found.");
    return listing;
  });
}

export function PATCH(request: Request, { params }: ListingRoute) {
  return listingResponse(async () => {
    const seller = await requireTradeUser();
    const id = requireListingId((await params).id);
    const { input, image } = await readListingSubmission(request, updateListingSchema);
    return updateListing(seller.id, id, input, image);
  });
}
