import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireTradeUser, ViewerError } from "@/lib/auth/viewer";
import { ChatError, listConversations } from "@/lib/trade/server";

async function Inbox() {
  try {
    const viewer = await requireTradeUser();
    const rooms = await listConversations(viewer.id);
    if (rooms.length === 0) return <p className="text-muted-foreground">No conversations yet.</p>;

    return (
      <ul className="grid gap-3">
        {rooms.map(({ id, buyerId, listing }) => (
          <li key={id}>
            <Link href={`/trade/${id}`} className="block rounded-lg border border-border bg-card p-4 hover:bg-muted">
              <span className="block font-semibold wrap-anywhere">{listing.title}</span>
              <span className="text-sm text-muted-foreground">{buyerId === viewer.id ? "Buying" : "Selling"}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  } catch (error) {
    if (error instanceof ViewerError && error.status === 401) {
      return <Button asChild className="self-start"><Link href="/account?returnTo=%2Ftrade">Sign in with MetaMask</Link></Button>;
    }
    if (!(error instanceof ViewerError || error instanceof ChatError)) throw error;
    return <p role="alert">{error.message}</p>;
  }
}

export default function MessagesPage() {
  return (
    <div className="page-width flex flex-col gap-6 py-10 sm:py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">Messages</h1>
      <Inbox />
    </div>
  );
}
