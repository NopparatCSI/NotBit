"use client";

import { useState } from "react";
import type { ApiResult } from "@marketplace/shared";
import type { EvidenceItem } from "@/lib/evidence/files";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { AdminEmpty } from "./ui";
import { cn } from "@/lib/utils";

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
  const [busy, setBusy] = useState<Record<string, "open" | "verify" | undefined>>({});

  async function open(id: string) {
    setBusy(current => ({ ...current, [id]: "open" }));
    try {
      const { url } = await getJson<{ url: string }>(`/api/v1/orders/${orderId}/evidence/${id}`);
      setOpened((current) => ({ ...current, [id]: { url } }));
    } catch (error) {
      setOpened((current) => ({ ...current, [id]: { error: error instanceof Error ? error.message : "Could not open." } }));
    } finally {
      setBusy(current => ({ ...current, [id]: undefined }));
    }
  }

  async function verify(id: string) {
    setBusy(current => ({ ...current, [id]: "verify" }));
    try {
      const result = await getJson<{ matches: boolean; actualHash: string }>(`/api/v1/orders/${orderId}/evidence/${id}?verify=1`);
      setVerified((current) => ({ ...current, [id]: result }));
    } catch (error) {
      setVerified((current) => ({ ...current, [id]: { error: error instanceof Error ? error.message : "Could not verify." } }));
    } finally {
      setBusy(current => ({ ...current, [id]: undefined }));
    }
  }

  if (items.length === 0) return <AdminEmpty icon="image" title="No evidence uploaded yet" description="Files shared by the buyer and seller will appear here. Review the agreement and conversation for more context." />;

  return (
    <ul className="admin-evidence-grid">
      {items.map((item) => {
        const view = opened[item.id];
        const check = verified[item.id];
        return (
          <li key={item.id} className="admin-evidence-card flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Badge variant="outline">{stageLabels[item.stage]}</Badge>
              <p className="text-xs text-muted-foreground">{(item.sizeBytes / 1024).toFixed(0)} KB</p>
            </div>
            <p className="text-sm font-semibold">Submitted by {partyLabels[item.submittedBy].toLowerCase()}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{item.createdText}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="default" onClick={() => open(item.id)} disabled={Boolean(busy[item.id])}>
                <MarketplaceIcon name="image" data-icon="inline-start" />{busy[item.id] === "open" ? "Opening…" : view && "url" in view ? "Reload image" : "Open image"}
              </Button>
              {canVerify && (
                <Button type="button" variant="quiet" onClick={() => verify(item.id)} disabled={Boolean(busy[item.id])}>
                  {busy[item.id] === "verify" ? "Checking…" : "Verify hash"}
                </Button>
              )}
            </div>
            {check && ("error" in check
              ? <p role="alert" className="text-sm text-destructive">{check.error}</p>
              : <p role="status" className={cn("text-xs leading-relaxed", check.matches ? "text-success" : "text-destructive")}>
                {check.matches ? "Stored file matches the recorded hash." : `Hash mismatch. Stored file hashes to ${check.actualHash}.`}
              </p>)}
            {view && ("error" in view
              ? <p role="alert" className="text-sm text-destructive">{view.error}</p>
              // Signed URLs are short-lived and come from private storage, so next/image is not used.
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={view.url} alt={`${stageLabels[item.stage]} evidence from the ${partyLabels[item.submittedBy].toLowerCase()}`} loading="lazy"
                onError={() => setOpened(current => ({ ...current, [item.id]: { error: "This image link expired or could not be loaded. Open the image again to get a new link." } }))} />)}
            <details className="admin-metadata"><summary>File integrity details</summary><p className="break-all font-mono text-xs">{item.fileHash}</p>{receiptLinks[item.id] && <p className="text-xs leading-relaxed">{receiptLinks[item.id]}</p>}</details>
          </li>
        );
      })}
    </ul>
  );
}
