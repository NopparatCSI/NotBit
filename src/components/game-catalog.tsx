"use client";

import Image, { type StaticImageData } from "next/image";
import { ToggleGroup } from "radix-ui";
import { useRef, useState } from "react";
import { GameSpotlight, type SpotlightGame } from "@/components/game-spotlight";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Button } from "@/components/ui/button";

const allItems = "All items";

export type CatalogGame = SpotlightGame & {
  itemTypes: readonly string[];
  listings: readonly { name: string; type: string; price: string; artwork: StaticImageData }[];
};

export function GameCatalog({ games, initialGame }: {
  games: readonly CatalogGame[];
  initialGame: string;
}) {
  const [gameSlug, setGameSlug] = useState(initialGame);
  const [query, setQuery] = useState("");
  const [itemType, setItemType] = useState(allItems);
  const searchInput = useRef<HTMLInputElement>(null);
  const game = games.find((entry) => entry.slug === gameSlug);
  if (!game) return null;

  const terms = query.toLowerCase().trim().split(/\s+/);
  const results = game.listings.filter((listing) => {
    const text = `${listing.name} ${listing.type}`.toLowerCase();
    return (itemType === allItems || listing.type === itemType) && terms.every((term) => text.includes(term));
  });

  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
  }

  function selectGame(slug: string) {
    setGameSlug(slug);
    setQuery("");
    setItemType(allItems);
  }

  return (
    <>
      <GameSpotlight games={games} initialGame={initialGame} selectedGame={game} onSelectGame={selectGame} />
      <section id="marketplace" className="item-store" aria-labelledby="store-heading" tabIndex={-1}>
        <div className="store-banner">
          <div className="page-width store-banner-inner">
            <div className="store-banner-title">
              <h2 id="store-heading">Item Store</h2>
              <p>{game.name}</p>
            </div>
            <div className="catalog-search" role="search" aria-label="Search the Item Store">
              <MarketplaceIcon name="search" />
              <label className="sr-only" htmlFor="item-search">Search items in {game.name}</label>
              <input
                id="item-search"
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search items"
                autoComplete="off"
              />
              {query && (
                <Button type="button" variant="quiet" size="icon" onClick={clearSearch} aria-label="Clear search">
                  <MarketplaceIcon name="close" data-icon="inline-start" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="page-width store-products">
          <ToggleGroup.Root
            type="single"
            aria-label={`Item types for ${game.name}`}
            className="item-type-options"
            value={itemType}
            onValueChange={(value) => { if (value) setItemType(value); }}
          >
            {[allItems, ...game.itemTypes].map((type) => (
              <ToggleGroup.Item key={type} value={type} asChild>
                <Button type="button" variant="filter" size="text">{type}</Button>
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
          <div className="store-results-heading">
            <h3>Sample listings</h3>
            <p role="status" className="result-count">{results.length} {results.length === 1 ? "item" : "items"}</p>
          </div>
          {results.length ? (
            <ul className="item-grid">
              {results.map((listing) => (
                <li key={listing.name} className="store-item">
                  <div className="store-item-art">
                    <Image
                      src={listing.artwork}
                      alt=""
                      fill
                      sizes="(min-width: 1360px) 430px, (min-width: 640px) 32vw, 50vw"
                    />
                  </div>
                  <div className="store-item-details">
                    <div>
                      <h4>{listing.name}</h4>
                      <p>{listing.type}</p>
                    </div>
                    <p className="item-price">{listing.price} <span>ETH</span></p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-catalog">
              <p className="font-semibold">
                {query.trim() || itemType === allItems ? "No sample listings match your filters." : `No sample listings in ${itemType}.`}
              </p>
              <Button type="button" variant="outline" onClick={() => { setItemType(allItems); clearSearch(); }}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
