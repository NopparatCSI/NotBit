import "server-only";
import type { ApiErrorCode, ApiResult } from "@marketplace/shared";
import type { ZodType } from "zod";
import { ViewerError } from "@/lib/auth/viewer";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMessage, Conversation, MessagePage } from "./model";

const conversationColumns = `id, buyer_id, seller_id,
  listing:listings!inner(id, title, game_slug, quantity, region, delivery_method, price_wei, status)`;
const messageColumns = "id, sender_id, kind, body, created_at";
const pageSize = 50;

type ConversationRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing: Conversation["listing"];
};

type MessageRow = {
  id: string;
  sender_id: string | null;
  kind: ChatMessage["kind"];
  body: string;
  created_at: string;
};

export class ChatError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

async function requireDatabase() {
  const supabase = await createServerSupabase();
  if (!supabase) throw new ChatError(503, "UNAVAILABLE", "Supabase is not configured.");
  return supabase;
}

function checkError(error: { code: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new ChatError(403, "FORBIDDEN", "You do not have access to this conversation.");
  throw new ChatError(503, "UNAVAILABLE", "Messages are temporarily unavailable. Please try again.");
}

function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, buyerId: row.buyer_id, sellerId: row.seller_id, listing: row.listing };
}

function toMessage(row: MessageRow): ChatMessage {
  return { id: row.id, senderId: row.sender_id, kind: row.kind, body: row.body, createdAt: row.created_at };
}

export async function openConversation(listingId: string) {
  const supabase = await requireDatabase();
  const { data, error } = await supabase.rpc("open_listing_conversation", { p_listing_id: listingId });
  if (error?.code === "23514") {
    throw new ChatError(409, "CONFLICT", "You cannot start a chat on your own listing.");
  }
  checkError(error);
  if (!data) throw new ChatError(404, "NOT_FOUND", "This listing is no longer open for new conversations.");
  return { id: data as string };
}

export async function listConversations(viewerId: string) {
  const supabase = await requireDatabase();
  const { data, error } = await supabase.from("conversations").select(conversationColumns)
    .or(`buyer_id.eq.${viewerId},seller_id.eq.${viewerId}`).order("created_at", { ascending: false }).returns<ConversationRow[]>();
  checkError(error);
  return (data ?? []).map(toConversation);
}

export async function requireConversation(id: string, viewerId: string) {
  const supabase = await requireDatabase();
  const { data, error } = await supabase.from("conversations").select(conversationColumns).eq("id", id)
    .or(`buyer_id.eq.${viewerId},seller_id.eq.${viewerId}`).maybeSingle().returns<ConversationRow>();
  checkError(error);
  if (!data) throw new ChatError(404, "NOT_FOUND", "Conversation not found.");
  return toConversation(data);
}

export async function listMessages(conversationId: string, before?: string): Promise<MessagePage> {
  const supabase = await requireDatabase();
  const query = supabase.from("messages").select(messageColumns).eq("conversation_id", conversationId);
  if (before) {
    const anchor = await supabase.from("messages").select("created_at").eq("conversation_id", conversationId)
      .eq("id", before).maybeSingle();
    checkError(anchor.error);
    if (!anchor.data) throw new ChatError(404, "NOT_FOUND", "The selected message could not be found.");
    const timestamp = anchor.data.created_at;
    query.or(`created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${before})`);
  }
  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(pageSize + 1);
  checkError(error);
  const rows = data ?? [];
  const messages = rows.slice(0, pageSize).reverse().map(toMessage);
  return { messages, nextBefore: rows.length > pageSize ? messages[0].id : null };
}

export async function sendMessage(conversationId: string, senderId: string, body: string, id?: string) {
  const supabase = await requireDatabase();
  const { data, error } = await supabase.from("messages").insert({
    ...(id && { id }), conversation_id: conversationId, sender_id: senderId, kind: "USER", body,
  }).select(messageColumns).single();
  if (id && error?.code === "23505") {
    const existing = await supabase.from("messages").select(messageColumns)
      .eq("id", id).eq("conversation_id", conversationId).eq("sender_id", senderId).maybeSingle();
    checkError(existing.error);
    if (existing.data?.body === body) return toMessage(existing.data);
    throw new ChatError(409, "CONFLICT", "This message ID has already been used.");
  }
  checkError(error);
  if (!data) throw new ChatError(503, "UNAVAILABLE", "Could not send the message. Please try again.");
  return toMessage(data);
}

export async function chatResponse<T>(action: () => Promise<T>, status = 200) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return Response.json({ data: await action() } satisfies ApiResult<T>, { status, headers });
  } catch (error) {
    if (error instanceof ViewerError) {
      const code = error.status === 401 ? "UNAUTHENTICATED" : error.status === 403 ? "FORBIDDEN" : "UNAVAILABLE";
      return Response.json({ error: { code, message: error.message } }, { status: error.status, headers });
    }
    if (!(error instanceof ChatError)) throw error;
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
  }
}

export async function readChatInput<T>(request: Request, schema: ZodType<T>, message: string) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ChatError(415, "INVALID_INPUT", "Send conversation data as JSON.");
  }
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) throw new ChatError(400, "INVALID_INPUT", message);
  return input.data;
}
