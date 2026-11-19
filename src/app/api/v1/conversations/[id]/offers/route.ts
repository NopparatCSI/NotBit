import { requireTradeUser } from "@/lib/auth/viewer";
import { conversationIdSchema } from "@/lib/trade/model";
import { ChatError, chatResponse, readChatInput } from "@/lib/trade/server";
import { createOfferSchema } from "@/lib/offers/model";
import { listOffers, saveOffer } from "@/lib/offers/server";

type OfferRoute = { params: Promise<{ id: string }> };
async function access(route: OfferRoute) {
  const viewer = await requireTradeUser();
  const id = conversationIdSchema.safeParse((await route.params).id);
  if (!id.success) throw new ChatError(404, "NOT_FOUND", "Conversation not found.");
  return { id: id.data, viewer };
}
export function GET(request: Request, route: OfferRoute) {
  return chatResponse(async () => {
    const { id, viewer } = await access(route);
    const selectedId = new URL(request.url).searchParams.get("offerId");
    if (selectedId && !conversationIdSchema.safeParse(selectedId).success) throw new ChatError(400, "INVALID_INPUT", "Provide a valid offer ID.");
    return listOffers(id, viewer, selectedId ?? undefined);
  });
}
export function POST(request: Request, route: OfferRoute) {
  return chatResponse(async () => {
    const { id, viewer } = await access(route);
    const input = await readChatInput(request, createOfferSchema, "Check the offer terms and signature.");
    return saveOffer(id, viewer, input);
  }, 201);
}
