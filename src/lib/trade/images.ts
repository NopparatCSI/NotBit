import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { checkEvidenceFile, extensionFor } from "@/lib/evidence/files";
import { getServiceSupabase } from "@/lib/supabase/services";
import { maxChatImageBytes, sendImageMessageSchema } from "./model";
import { ChatError, checkError, messageColumns, requireDatabase, toMessage } from "./server";

function imageService() {
  const supabase = getServiceSupabase();
  if (!supabase) throw new ChatError(503, "UNAVAILABLE", "Chat images are temporarily unavailable.");
  return { supabase, images: supabase.storage.from("chat-images") };
}

export async function sendImageMessage(request: Request, conversationId: string, senderId: string) {
  const form = await request.formData().catch(() => null);
  const parsed = sendImageMessageSchema.safeParse({ id: form?.get("id"), body: form?.get("body") ?? "" });
  const files = form?.getAll("image") ?? [];
  const image = files[0];
  if (!parsed.success || files.length !== 1 || !(image instanceof File)) {
    throw new ChatError(400, "INVALID_INPUT", "Attach one image with a caption of up to 4,000 characters.");
  }
  if (image.size > maxChatImageBytes) throw new ChatError(400, "INVALID_INPUT", "Choose an image up to 3 MB.");
  const bytes = Buffer.from(await image.arrayBuffer());
  const checked = checkEvidenceFile("Image", image.type, bytes);
  if (!checked.ok) throw new ChatError(400, "INVALID_INPUT", checked.message);

  const id = parsed.data.id.toLowerCase();
  const { body } = parsed.data;
  const messageFolder = `${conversationId.toLowerCase()}/${senderId}/${id}`;
  const filename = `${createHash("sha256").update(bytes).digest("hex")}.${extensionFor(checked.type)}`;
  const { supabase, images } = imageService();

  async function findExisting() {
    const { data, error } = await supabase.from("messages").select(messageColumns).eq("id", id).maybeSingle();
    checkError(error);
    if (!data) return null;
    if (data.sender_id !== senderId || data.body !== body || !data.image_path?.startsWith(`${messageFolder}/`)
      || !data.image_path.endsWith(`/${filename}`)) {
      throw new ChatError(409, "CONFLICT", "This message ID has already been used.");
    }
    return toMessage(data);
  }

  const existing = await findExisting();
  if (existing) return existing;

  // Each attempt owns its object, so a duplicate message can discard its upload safely.
  const path = `${messageFolder}/${randomUUID()}/${filename}`;
  const uploaded = await images.upload(path, bytes, { contentType: checked.type, upsert: false });
  if (uploaded.error) throw new ChatError(503, "UNAVAILABLE", "Could not store the chat image. Try again.");

  const { data, error } = await supabase.from("messages").insert({
    id, conversation_id: conversationId, sender_id: senderId, kind: "USER", body, image_path: path,
  }).select(messageColumns).single();
  if (data) return toMessage(data);
  // A constraint violation rolls the write back. A lost connection may have committed it.
  if (error?.code.startsWith("23")) await images.remove([path]);
  if (error?.code === "23505") {
    const retry = await findExisting();
    if (retry) return retry;
  }
  throw new ChatError(503, "UNAVAILABLE", "Could not send the image. Try again.");
}

export async function downloadChatImage(conversationId: string, messageId: string) {
  const db = await requireDatabase();
  const { data, error } = await db.from("messages").select("image_path").eq("conversation_id", conversationId).eq("id", messageId).maybeSingle();
  checkError(error);
  if (!data?.image_path) throw new ChatError(404, "NOT_FOUND", "Chat image not found.");
  const { images } = imageService();
  const stored = await images.download(data.image_path);
  if (stored.error || !stored.data) throw new ChatError(503, "UNAVAILABLE", "Could not open the chat image.");
  return new Response(stored.data, { headers: {
    "Content-Type": stored.data.type || "application/octet-stream",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
