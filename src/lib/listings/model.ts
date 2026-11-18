import { weiSchema } from "@marketplace/shared";
import { z } from "zod";

export const listingIdSchema = z.uuid();
export const gameSlugSchema = z.string().max(80).regex(/^[a-z0-9-]+$/);
export const listingImageMaxBytes = 10 * 1024 * 1024;
export const listingImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const createListingSchema = z.strictObject({
  gameSlug: gameSlugSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  quantity: z.number().int().min(1).max(2_147_483_647),
  region: z.string().trim().min(1).max(80),
  deliveryMethod: z.string().trim().min(1).max(240),
  priceWei: weiSchema,
  itemType: z.string().trim().min(1).max(80).nullable().optional(),
});

export const updateListingSchema = createListingSchema.partial().extend({
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export type NewListing = z.infer<typeof createListingSchema>;
export type ListingChanges = z.infer<typeof updateListingSchema>;
export type Listing = Omit<NewListing, "itemType"> & {
  id: string;
  itemType: string | null;
  status: "ACTIVE" | "PAUSED" | "SOLD";
  imageUrl: string | null;
  createdAt: string;
};

export const listingStatusLabel = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  SOLD: "Sold",
} satisfies Record<Listing["status"], string>;
