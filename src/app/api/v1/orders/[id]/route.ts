import { requireTradeUser } from "@/lib/auth/viewer";
import { conversationIdSchema } from "@/lib/trade/model";
import { ChatError, chatResponse, readChatInput } from "@/lib/trade/server";
import { fundingSchema } from "@/lib/offers/model";
import { readFunding, recordFunding, requireOffer } from "@/lib/offers/server";

type OrderRoute = { params: Promise<{ id: string }> };
async function access(route: OrderRoute) {
  const viewer = await requireTradeUser();
  const id = conversationIdSchema.safeParse((await route.params).id);
  if (!id.success) throw new ChatError(404, "NOT_FOUND", "Order not found.");
  return { viewer, offer: await requireOffer(id.data, viewer) };
}
export function GET(_request: Request, route: OrderRoute) {
  return chatResponse(async () => {
    const { offer } = await access(route);
    return { id: offer.id, chainOrderId: offer.signedOffer.orderId, amountWei: offer.signedOffer.amount, ...await readFunding(offer) };
  });
}
export function POST(request: Request, route: OrderRoute) {
  return chatResponse(async () => {
    const { offer, viewer } = await access(route);
    const { hash } = await readChatInput(request, fundingSchema, "Provide a valid transaction hash.");
    await recordFunding(offer, viewer, hash as `0x${string}`);
    return { id: offer.id, ...await readFunding(offer) };
  });
}
