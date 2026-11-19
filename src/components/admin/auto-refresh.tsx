"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
export function AdminAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible" || pending) return;
      startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router, pending]);
  return <p className="text-xs text-muted-foreground" aria-live="polite">{pending ? "Updating confirmed status…" : "Updates automatically every 15 seconds while this page is visible."}</p>;
}
