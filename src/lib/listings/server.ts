import "server-only";
import { ApiError } from "@/lib/api/response";
import type { ApiErrorCode, ApiResult } from "@marketplace/shared";
import type { ZodType } from "zod";
import { ViewerError } from "@/lib/auth/viewer";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { ChatError } from "@/lib/trade/server";
import { ListingImageError, validateListingImage } from "./image";
import type { Listing, ListingChanges, NewListing } from "./model";

const columns = "id, game_slug, title, description, quantity, region, delivery_method, price_wei, item_type, status, image_path, created_at";

type ListingRow = {
  id: string;
  game_slug: string;
  title: string;
  description: string;
  quantity: number;
  region: string;
  delivery_method: string;
  price_wei: string;
  item_type: string | null;
  status: Listing["status"];
  image_path: string | null;
  created_at: string;
};

export class ListingError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

async function requireDatabase() {
  const supabase = await createServerSupabase();
  if (!supabase) throw new ListingError(503, "UNAVAILABLE", "Supabase is not configured.");
  return supabase;
}

function checkDatabaseError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === "23503") throw new ListingError(400, "INVALID_INPUT", "The selected game is unavailable.");
  if (error.code === "42501") throw new ListingError(403, "FORBIDDEN", "This account cannot manage listings.");
  throw new ListingError(503, "UNAVAILABLE", "Listings are temporarily unavailable. Please try again.");
}

function toListing(supabase: Awaited<ReturnType<typeof requireDatabase>>, row: ListingRow): Listing {
  return {
    id: row.id,
    gameSlug: row.game_slug,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    region: row.region,
    deliveryMethod: row.delivery_method,
    priceWei: row.price_wei,
    itemType: row.item_type,
    status: row.status,
    imageUrl: row.image_path ? supabase.storage.from("listing-images").getPublicUrl(row.image_path).data.publicUrl : null,
    createdAt: row.created_at,
  };
}

function toRow(input: ListingChanges) {
  return {
    game_slug: input.gameSlug,
    title: input.title,
    description: input.description,
    quantity: input.quantity,
    region: input.region,
    delivery_method: input.deliveryMethod,
    price_wei: input.priceWei,
    item_type: input.itemType,
    status: input.status,
  };
}

export async function listActiveListings(gameSlug?: string) {
  const supabase = await requireDatabase();
  const query = supabase.from("listings").select(columns).eq("status", "ACTIVE");
  if (gameSlug) query.eq("game_slug", gameSlug);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id");
  checkDatabaseError(error);
  return (data ?? []).map((row) => toListing(supabase, row));
}

export async function findActiveListing(id: string) {
  const supabase = await requireDatabase();
  const { data, error } = await supabase.from("listings").select(columns)
    .eq("id", id).eq("status", "ACTIVE").maybeSingle();
  checkDatabaseError(error);
  return data ? toListing(supabase, data) : null;
}

export async function loadSellerListings(sellerId: string) {
  const supabase = await requireDatabase();
  const [listings, games] = await Promise.all([
    supabase.from("listings").select(columns).eq("seller_id", sellerId)
      .order("created_at", { ascending: false }).order("id"),
    supabase.from("games").select("slug, name").order("name"),
  ]);
  checkDatabaseError(listings.error);
  checkDatabaseError(games.error);
  return {
    listings: (listings.data ?? []).map((row) => toListing(supabase, row)),
    games: games.data ?? [],
  };
}

async function uploadImage(service: ReturnType<typeof createServiceSupabase>, sellerId: string, listingId: string, file: File) {
  let prepared;
  try { prepared = await validateListingImage(file); }
  catch (error) {
    if (!(error instanceof ListingImageError)) throw error;
    throw new ListingError(400, "INVALID_INPUT", error.message);
  }
  const path = `${sellerId}/${listingId}/${crypto.randomUUID()}.${prepared.extension}`;
  const { error } = await service.storage.from("listing-images").upload(path, prepared.bytes, {
    contentType: prepared.contentType, cacheControl: "31536000", upsert: false,
  });
  if (error) throw new ListingError(503, "UNAVAILABLE", "Image uploads are currently unavailable. Please try again.");
  return path;
}

async function discardImage(service: ReturnType<typeof createServiceSupabase> | null, path: string | undefined) {
  if (!service || !path) return;
  try {
    const { error } = await service.storage.from("listing-images").remove([path]);
    if (error) console.error("Could not clean up an unlinked listing image", path);
  } catch { console.error("Could not clean up an unlinked listing image", path); }
}

export async function createListing(sellerId: string, input: NewListing, image?: File) {
  const supabase = await requireDatabase();
  const id = crypto.randomUUID();
  const service = image ? createServiceSupabase() : null;
  const path = image && service ? await uploadImage(service, sellerId, id, image) : undefined;
  try {
    const { data, error } = await (service ?? supabase).from("listings")
      .insert({ ...toRow(input), seller_id: sellerId, ...(path && { id, image_path: path }) }).select(columns).single();
    checkDatabaseError(error);
    if (!data) throw new ListingError(503, "UNAVAILABLE", "Could not save the listing. Please try again.");
    return toListing(supabase, data);
  } catch (error) { await discardImage(service, path); throw error; }
}

export async function updateListing(sellerId: string, id: string, input: ListingChanges, image?: File) {
  const supabase = await requireDatabase();
  const current = await supabase.from("listings").select("status")
    .eq("id", id).eq("seller_id", sellerId).maybeSingle();
  checkDatabaseError(current.error);
  if (current.data?.status === "SOLD") {
    throw new ListingError(409, "CONFLICT", "This listing has already sold.");
  }
  if (!current.data) throw new ListingError(404, "NOT_FOUND", "No editable listing found.");
  const service = image ? createServiceSupabase() : null;
  const path = image && service ? await uploadImage(service, sellerId, id, image) : undefined;
  try {
    const { data, error } = await (service ?? supabase).from("listings").update({ ...toRow(input), ...(path && { image_path: path }) })
      .eq("id", id).eq("seller_id", sellerId).in("status", ["ACTIVE", "PAUSED"])
      .select(columns).maybeSingle();
    checkDatabaseError(error);
    if (!data) throw new ListingError(409, "CONFLICT", "This listing has changed. Refresh and try again.");
    return toListing(supabase, data);
  } catch (error) { await discardImage(service, path); throw error; }
}

export function listingResponse<T>(operation: () => Promise<T>, successStatus = 200) {
  const headers = { "Cache-Control": "private, no-store" };
  return operation().then((data) =>
    Response.json({ data } satisfies ApiResult<T>, { status: successStatus, headers }),
  ).catch((error: unknown) => {
    if (error instanceof ViewerError) {
      const code = error.status === 401 ? "UNAUTHENTICATED" : error.status === 403 ? "FORBIDDEN" : "UNAVAILABLE";
      return Response.json({ error: { code, message: error.message } }, { status: error.status, headers });
    }
    if (!(error instanceof ListingError || error instanceof ChatError || error instanceof ApiError)) throw error;
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
  });
}

export async function readListingInput<T>(request: Request, schema: ZodType<T>) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new ListingError(415, "INVALID_INPUT", "Send listing data as JSON.");
  }
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    throw new ListingError(400, "INVALID_INPUT", "Check the listing title, game, quantity, price, and other details.");
  }
  return result.data;
}
