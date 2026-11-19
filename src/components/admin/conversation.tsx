"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { ChatMessage, ConversationPage } from "@/lib/admin/queries";
import type { ApiResult } from "@marketplace/shared";
import { mergeChatMessages, refreshConversation } from "@/lib/admin/conversation-model";
import { formatTime } from "@/lib/admin/format";
import { Button } from "@/components/ui/button";
import { AdminEmpty } from "./ui";

function ChatImage({ orderId, messageId }: { orderId: string; messageId: string }) {
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const url = `/api/v1/admin/orders/${orderId}/chat/${messageId}/image`;
  return <div className="mt-3 flex flex-col items-start gap-3">
    {opened && !failed && <a href={url} target="_blank" rel="noreferrer" aria-label="Open original chat image"><Image key={revision} src={url} alt="Image attached to this message" unoptimized width={520} height={390} className="max-h-80 w-full object-contain" onError={() => setFailed(true)} /></a>}
    {failed && <p role="alert" className="text-sm text-destructive">Could not open this image. Try again.</p>}
    <Button type="button" variant="outline" onClick={() => { setFailed(false); setOpened(true); setRevision(value => value + 1); }}>{opened ? "Reload attached image" : "View attached image"}</Button>
  </div>;
}

export function OrderConversation({ orderId, page }: { orderId: string; page: ConversationPage }) {
  const [history, setHistory] = useState(page);
  const { messages, nextBefore: before } = history;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setHistory(current => refreshConversation(current, page)); }, [page]);
  async function earlier() {
    if (!before || loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/admin/orders/${orderId}/chat?before=${before}`, { cache: "no-store" });
      const body: ApiResult<ConversationPage> = await response.json();
      if ("error" in body) throw new Error(body.error.message);
      if (!response.ok) throw new Error("Could not load earlier messages.");
      setHistory(current => current.nextBefore !== before ? current : { messages: mergeChatMessages(current.messages, body.data.messages), nextBefore: body.data.nextBefore });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load earlier messages."); }
    finally { setLoading(false); }
  }
  if (!messages.length) return <AdminEmpty icon="file" title="No messages recorded" description="Messages from the buyer and seller will appear here when available." />;
  return <div className="flex flex-col gap-3">{before && <Button type="button" variant="outline" disabled={loading} onClick={earlier}>{loading ? "Loading earlier messages…" : "Load earlier messages"}</Button>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<ol className="admin-chat-list" tabIndex={0} aria-label="Order conversation">
    {messages.map(message => <li key={message.id} data-sender={message.from}><p className="text-xs font-semibold">{message.from === "SYSTEM" ? "NOTBIT system" : message.from === "BUYER" ? "Buyer" : "Seller"}<time className="ml-2 font-normal text-muted-foreground" dateTime={message.created_at}>{formatTime(message.created_at)}</time></p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>{message.hasImage && <ChatImage orderId={orderId} messageId={message.id} />}</li>)}
  </ol></div>;
}
