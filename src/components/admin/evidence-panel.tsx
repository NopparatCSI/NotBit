"use client";

import { useState } from "react";
import type { ApiResult } from "@marketplace/shared";
import type { EvidenceItem } from "@/lib/evidence/files";
import { Button } from "@/components/ui/button";

const stageLabels = { DELIVERY: "Delivery", RECEIPT: "Receipt", DISPUTE: "Dispute" } as const;
const partyLabels = { BUYER: "Buyer", SELLER: "Seller" } as const;

type Opened = { url: string } | { error: string };
type Verified = { matches: boolean; actualHash: string } | { error: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const result = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!result || "error" in result) throw new Error(result?.error.message ?? "The server could not be reached.");
  return result.data;
}

// Each Open fetches a 60-second signed URL. For staff, the server logs the access first.
export function EvidencePanel({ orderId, items, canVerify, receiptLinks }: {
  orderId: string;
  items: (EvidenceItem & { createdText: string })[];
  canVerify: boolean;
  receiptLinks: Record<string, string>;
}) {
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [verified, setVerified] = useState<Record<string, Verified>>({});
  const [busy, setBusy] = useState("");

  async function open(id: string) {
    setBusy(id);
    try {
      const { url } = await getJson<{ url: string }>(`/api/v1/orders/${orderId}/evidence/${id}`);
      setOpened((current) => ({ ...current, [id]: { url } }));
    } catch (error) {
      setOpened((current) => ({ ...current, [id]: { error: error instanceof Error ? error.message : "Could not open." } }));
    } finally {
      setBusy("");
    }
  }

  async function verify(id: string) {
    setBusy(id);
    try {
      const result = await getJson<{ matches: boolean; actualHash: string }>(`/api/v1/orders/${orderId}/evidence/${id}?verify=1`);
      setVerified((current) => ({ ...current, [id]: result }));
    } catch (error) {
      setVerified((current) => ({ ...current, [id]: { error: error instanceof Error ? error.message : "Could not verify." } }));
    } finally {
      setBusy("");
    }
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">No evidence uploaded yet.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const view = opened[item.id];
        const check = verified[item.id];
        return (
          <li key={item.id} className="flex flex-col gap-2 border-b border-border pb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold">{stageLabels[item.stage]} · {partyLabels[item.submittedBy]}</p>
              <p className="text-xs text-muted-foreground">{item.createdText} · {(item.sizeBytes / 1024).toFixed(0)} KB</p>
            </div>
            <p className="font-mono text-xs break-all text-muted-foreground">File hash {item.fileHash}</p>
            {receiptLinks[item.id] && <p className="text-xs text-muted-foreground">{receiptLinks[item.id]}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="default" onClick={() => open(item.id)} disabled={busy === item.id}>
                {view && "url" in view ? "Reload image" : "Open image"}
              </Button>
              {canVerify && (
                <Button type="button" variant="quiet" onClick={() => verify(item.id)} disabled={busy === item.id}>
                  Verify hash
                </Button>
              )}
            </div>
            {check && ("error" in check
              ? <p role="alert" className="text-sm text-destructive">{check.error}</p>
              : <p role="status" className={check.matches ? "text-sm" : "text-sm text-destructive"}>
                {check.matches ? "Stored file matches the recorded hash." : `Hash mismatch. Stored file hashes to ${check.actualHash}.`}
              </p>)}
            {view && ("error" in view
              ? <p role="alert" className="text-sm text-destructive">{view.error}</p>
              // Signed URLs are short-lived and come from private storage, so next/image is not used.
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={view.url} alt={`${stageLabels[item.stage]} evidence from the ${partyLabels[item.submittedBy].toLowerCase()}`}
                className="max-h-[28rem] w-full rounded-lg border border-border object-contain" />)}
          </li>
        );
      })}
    </ul>
  );
}