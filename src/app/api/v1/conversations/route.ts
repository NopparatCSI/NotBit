import { requireTradeUser } from "@/lib/auth/viewer";
import { openConversationSchema } from "@/lib/trade/model";
import { chatResponse, openConversation, readChatInput } from "@/lib/trade/server";

export function POST(request: Request) {
  return chatResponse(async () => {
    await requireTradeUser();
    const { listingId } = await readChatInput(request, openConversationSchema, "Provide a valid listing ID.");
    return openConversation(listingId);
  });
}
