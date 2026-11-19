import { requireTradeUser } from "@/lib/auth/viewer";
import { conversationIdSchema, sendMessageSchema, stagedImageMessageSchema } from "@/lib/trade/model";
import { sendImageMessage } from "@/lib/trade/images";
import { ChatError, chatResponse, listMessages, readChatInput, requireConversation, sendMessage } from "@/lib/trade/server";

type MessageRoute = { params: Promise<{ id: string }> };

async function requireChat({ params }: MessageRoute) {
  const viewer = await requireTradeUser();
  const id = conversationIdSchema.safeParse((await params).id);
  if (!id.success) throw new ChatError(404, "NOT_FOUND", "Conversation not found.");
  await requireConversation(id.data, viewer.id);
  return { id: id.data, viewer };
}

export function GET(request: Request, route: MessageRoute) {
  return chatResponse(async () => {
    const { id } = await requireChat(route);
    const before = new URL(request.url).searchParams.get("before");
    if (before !== null && !conversationIdSchema.safeParse(before).success) {
      throw new ChatError(400, "INVALID_INPUT", "Provide a valid message cursor.");
    }
    return listMessages(id, before ?? undefined);
  });
}

export function POST(request: Request, route: MessageRoute) {
  return chatResponse(async () => {
    const { id, viewer } = await requireChat(route);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "multipart/form-data") {
      return sendImageMessage(request, id, viewer.id);
    }
    const input = await readChatInput(request, stagedImageMessageSchema.or(sendMessageSchema), "Enter a message or a valid uploaded image.");
    if ("imageTicketId" in input) return sendImageMessage(request, id, viewer.id, input);
    return sendMessage(id, viewer.id, input.body, input.id);
  }, 201);
}
