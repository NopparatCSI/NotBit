import "server-only";
import sharp from "sharp";
import { listingImageMaxBytes } from "./model";

export class ListingImageError extends Error {}

export async function validateListingImage(file: File) {
  if (file.size === 0 || file.size > listingImageMaxBytes) {
    throw new ListingImageError("Choose an image between 1 byte and 10 MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(bytes, { animated: true, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "jpeg" && metadata.format !== "png" && metadata.format !== "webp") {
      throw new ListingImageError("Choose a JPEG, PNG, or WebP image.");
    }
    await image.stats();
    const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
    return { bytes, contentType: `image/${metadata.format}`, extension };
  } catch (error) {
    if (error instanceof ListingImageError) throw error;
    throw new ListingImageError("The file is not a readable JPEG, PNG, or WebP image.");
  }
}
