"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { formatEther, parseEther } from "viem";
import type { ApiResult } from "@marketplace/shared";
import { Button } from "@/components/ui/button";
import { uploadStagedImage } from "@/lib/uploads/client";
import { createListingSchema, listingImageMaxBytes, listingImageTypes, type Listing, type ListingChanges } from "@/lib/listings/model";

const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2";

export function ListingForm({ games, listing }: {
  games: { slug: string; name: string }[];
  listing?: Listing;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const busy = saving || refreshing;
  useEffect(() => {
    if (!image) { setPreview(null); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function save(changes: ListingChanges, form?: HTMLFormElement, selectedImage?: File) {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const imageTicketId = selectedImage ? await uploadStagedImage(selectedImage, "listing", listing?.id) : undefined;
      const body = JSON.stringify({ ...changes, imageTicketId });
      const headers = { "Content-Type": "application/json" };
      const response = await fetch(listing ? `/api/v1/listings/${listing.id}` : "/api/v1/listings", {
        method: listing ? "PATCH" : "POST",
        headers, body,
      });
      const result: ApiResult<Listing> = await response.json();
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      if (!response.ok) throw new Error("Listing request failed");
      if (!listing) form?.reset();
      if (selectedImage) {
        setImage(null);
        if (imageInput.current) imageInput.current.value = "";
      }
      setMessage("Listing saved.");
      startTransition(() => router.refresh());
    } catch {
      setError("Could not save the listing. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const price = String(fields.get("price")).trim();
    setMessage("");
    if (!/^\d{1,60}(\.\d{1,18})?$/.test(price)) {
      setError("Enter an ETH price with up to 18 decimal places.");
      return;
    }

    const input = createListingSchema.safeParse({
      gameSlug: fields.get("gameSlug"),
      title: fields.get("title"),
      itemType: String(fields.get("itemType")).trim() || null,
      description: fields.get("description"),
      quantity: Number(fields.get("quantity")),
      region: fields.get("region"),
      deliveryMethod: fields.get("deliveryMethod"),
      priceWei: parseEther(price).toString(),
    });
    if (!input.success) {
      setError("Complete the required fields and enter a valid price greater than 0 ETH.");
      return;
    }
    await save(input.data, form, image ?? undefined);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid gap-1">Item name
          <input className={fieldClass} name="title" defaultValue={listing?.title} required maxLength={120} />
        </label>
        <label className="grid gap-1">Game
          <select className={fieldClass} name="gameSlug" defaultValue={listing?.gameSlug ?? ""} required>
            <option value="" disabled>Select a game</option>
            {games.map(({ slug, name }) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Item category (optional)
          <input className={fieldClass} name="itemType" defaultValue={listing?.itemType ?? ""} maxLength={80} />
        </label>
        <label className="grid gap-1">Price in Sepolia ETH
          <input className={fieldClass} name="price" inputMode="decimal" defaultValue={listing && formatEther(BigInt(listing.priceWei))} required maxLength={79} />
        </label>
        <label className="grid gap-1">Quantity
          <input className={fieldClass} name="quantity" type="number" min={1} max={2_147_483_647} step={1} defaultValue={listing?.quantity ?? 1} required />
        </label>
        <label className="grid gap-1">Server or region
          <input className={fieldClass} name="region" defaultValue={listing?.region} required maxLength={80} />
        </label>
        <label className="grid gap-1 sm:col-span-2">Delivery method
          <input className={fieldClass} name="deliveryMethod" defaultValue={listing?.deliveryMethod} required maxLength={240} />
        </label>
        <label className="grid gap-1 sm:col-span-2">Item description
          <textarea className={fieldClass} name="description" defaultValue={listing?.description} required rows={3} maxLength={4000} />
        </label>
        <div className="min-w-0 space-y-3 sm:col-span-2">
          <label className="grid gap-2">Listing image (optional)
            <input ref={imageInput} name="listingImage" type="file" accept={listingImageTypes.join(",")} className="w-full min-w-0"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setMessage("");
                setError("");
                if (file && (file.size === 0 || file.size > listingImageMaxBytes)) {
                  setError("Choose an image between 1 byte and 10 MB.");
                  event.target.value = "";
                  setImage(null);
                  return;
                }
                if (file?.type && !listingImageTypes.some((type) => type === file.type)) {
                  setError("Choose a JPEG, PNG, or WebP image.");
                  event.target.value = "";
                  setImage(null);
                  return;
                }
                setImage(file ?? null);
              }} />
          </label>
          <p className="text-sm text-muted-foreground">JPEG, PNG or WebP, up to 10 MB. This image will be visible to everyone.</p>
          {(preview ?? listing?.imageUrl) && <Image unoptimized src={(preview ?? listing?.imageUrl)!} alt="Listing image preview" width={640} height={480} className="max-h-64 w-full rounded-lg object-contain" />}
          {image && <Button type="button" variant="outline" onClick={() => { setImage(null); if (imageInput.current) imageInput.current.value = ""; }}>
            {listing ? "Cancel image change" : "Remove selection"}
          </Button>}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{listing ? "Save changes" : "Publish listing"}</Button>
        {listing && (
          <Button type="button" variant="outline" disabled={busy}
            onClick={() => void save({ status: listing.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })}>
            {listing.status === "ACTIVE" ? "Pause listing" : "Resume listing"}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {(message || busy) && <p role="status">{busy ? "Saving listing…" : message}</p>}
    </form>
  );
}
