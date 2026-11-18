import { expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
import { validateListingImage } from "../src/lib/listings/image";

it("decodes supported image bytes independently of the supplied filename and MIME type", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: "#987654" } }).toFormat(format).toBuffer();
    const result = await validateListingImage(new File([new Uint8Array(bytes)], "wrong-name.svg", { type: "image/svg+xml" }));
    expect(result.contentType).toBe(`image/${format}`);
    expect(result.extension).toBe(format === "jpeg" ? "jpg" : format);
    expect(result.bytes.equals(bytes)).toBe(true);
  }
});

it("rejects empty, oversized, corrupted and unsupported image content", async () => {
  await expect(validateListingImage(new File([], "empty.png"))).rejects.toThrow("10 MB");
  await expect(validateListingImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png"))).rejects.toThrow("10 MB");
  await expect(validateListingImage(new File(["<html>not an image</html>"], "fake.png", { type: "image/png" }))).rejects.toThrow("readable");
  const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).gif().toBuffer();
  await expect(validateListingImage(new File([new Uint8Array(gif)], "image.gif"))).rejects.toThrow("JPEG, PNG, or WebP");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
  await expect(validateListingImage(new File([new Uint8Array(png.subarray(0, 20))], "truncated.png"))).rejects.toThrow("readable");
});
