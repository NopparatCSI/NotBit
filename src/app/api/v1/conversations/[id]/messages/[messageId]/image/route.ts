import { requireTradeUser } from "@/lib/auth/viewer";
import { downloadChatImage } from "@/lib/trade/images";
import { conversationIdSchema } from "@/lib/trade/model";
import { ChatError, chatResponse, requireConversation } from "@/lib/trade/server";

export function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  return chatResponse(async () => {
    const viewer = await requireTradeUser();
    const { id, messageId } = await params;
    if (!conversationIdSchema.safeParse(id).success || !conversationIdSchema.safeParse(messageId).success) {
      throw new ChatError(404, "NOT_FOUND", "Chat image not found.");
    }
    await requireConversation(id, viewer.id);
    return downloadChatImage(id, messageId);
  });
}
