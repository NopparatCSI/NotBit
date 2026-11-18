import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TradeRoom } from "@/components/trade-room";
import { Button } from "@/components/ui/button";
import { requireTradeUser, ViewerError } from "@/lib/auth/viewer";
import { conversationIdSchema } from "@/lib/trade/model";
import { ChatError, listMessages, requireConversation } from "@/lib/trade/server";

export default async function TradePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const parsed = conversationIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const selected = conversationIdSchema.safeParse((await searchParams).order);
  try {
    const viewer = await requireTradeUser();
    const room = await requireConversation(parsed.data, viewer.id);
    const history = await listMessages(room.id);
    return (
      <article className="page-width flex flex-col gap-5 py-10 sm:py-16">
        <Button asChild variant="outline" className="self-start"><Link href="/trade">Back to messages</Link></Button>
        <h1 className="text-3xl font-semibold wrap-anywhere">{room.listing.title}</h1>
        <TradeRoom key={`${room.id}:${selected.success ? selected.data : ""}`} room={room} viewerId={viewer.id} initialHistory={history} initialOfferId={selected.success ? selected.data : undefined} />
      </article>
    );
  } catch (error) {
    if (error instanceof ViewerError && error.status === 401) redirect("/account?returnTo=%2Ftrade");
    if (error instanceof ChatError && error.status === 404) notFound();
    if (!(error instanceof ViewerError || error instanceof ChatError)) throw error;
    return <div className="page-width py-10"><p role="alert">{error.message}</p></div>;
  }
}
