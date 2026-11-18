import "server-only";
import type { ZodType } from "zod";
import { listingImageMaxBytes } from "./model";
import { ListingError, readListingInput } from "./server";

export async function readListingSubmission<T>(request: Request, schema: ZodType<T>) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { input: await readListingInput(request, schema), image: undefined };
  }
  const maxBodyBytes = listingImageMaxBytes + 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maxBodyBytes) {
    throw new ListingError(413, "INVALID_INPUT", "The image upload is too large. The image limit is 10 MB.");
  }
  if (!request.body) throw new ListingError(400, "INVALID_INPUT", "Provide listing data and an optional image.");
  const reader = request.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new ListingError(413, "INVALID_INPUT", "The image upload is too large. The image limit is 10 MB.");
      }
      parts.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(new Blob(parts), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new ListingError(400, "INVALID_INPUT", "The image upload could not be read. Please try again."); }
  if (form.getAll("data").length !== 1 || form.getAll("image").length > 1) {
    throw new ListingError(400, "INVALID_INPUT", "Provide listing data and at most one image.");
  }
  const raw = form.get("data");
  let payload: unknown;
  try { payload = typeof raw === "string" ? JSON.parse(raw) : null; }
  catch { throw new ListingError(400, "INVALID_INPUT", "The listing data is invalid."); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ListingError(400, "INVALID_INPUT", "Check the listing title, game, quantity, price, and other details.");
  const image = form.get("image");
  if (image !== null && !(image instanceof File)) throw new ListingError(400, "INVALID_INPUT", "Choose an image file.");
  return { input: parsed.data, image: image ?? undefined };
}
