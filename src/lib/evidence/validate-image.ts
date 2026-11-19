import "server-only";
import sharp from "sharp";
import { checkEvidenceFile, type FileCheck } from "./files";

// Decode all frames without rewriting bytes: evidence hashes must refer to the original file.
export async function checkDecodedEvidenceFile(name: string, declaredType: string, bytes: Uint8Array): Promise<FileCheck> {
  const checked = checkEvidenceFile(name, declaredType, bytes);
  if (!checked.ok) return checked;
  try {
    const image = sharp(bytes, { animated: true, failOn: "warning", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (`image/${metadata.format}` !== checked.type || !metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) {
      return { ok: false, message: `${name} is not a supported image within the 40 megapixel limit.` };
    }
    await image.stats();
    return checked;
  } catch {
    return { ok: false, message: `${name} is not a readable JPEG, PNG, or WebP image.` };
  }
}
