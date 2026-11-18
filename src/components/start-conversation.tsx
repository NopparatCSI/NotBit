"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiResult } from "@marketplace/shared";
import { Button } from "@/components/ui/button";

export function StartConversation({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (response.status === 401) {
        router.push(`/account?returnTo=${encodeURIComponent(`/buy/listings/${listingId}`)}`);
        return;
      }
      const result: ApiResult<{ id: string }> = await response.json();
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      router.push(`/trade/${result.data.id}`);
    } catch {
      setError("Could not open the conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={busy} onClick={open}>{busy ? "Opening chat…" : "Chat with seller"}</Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
