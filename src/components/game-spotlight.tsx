"use client";

import { getImageProps, type StaticImageData } from "next/image";
import { Tabs } from "radix-ui";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Button } from "@/components/ui/button";

export type SpotlightGame = {
  slug: string;
  name: string;
  items: string;
  spotlight: { wide: StaticImageData; mobile: StaticImageData };
};

export function GameSpotlight({ games, initialGame, selectedGame, onSelectGame }: {
  games: readonly SpotlightGame[];
  initialGame: string;
  selectedGame: SpotlightGame;
  onSelectGame: (slug: string) => void;
}) {
  const featured = games.find((game) => game.slug === initialGame);
  const spotlightOrder = featured ? [featured, ...games.filter((game) => game !== featured)] : games;
  const { props: wideImage } = getImageProps({
    src: selectedGame.spotlight.wide,
    alt: "",
    fill: true,
    sizes: "(max-width: 899px) 1280px, 100vw",
    loading: "eager",
    fetchPriority: "high",
  });
  const { props: mobileImage } = getImageProps({
    src: selectedGame.spotlight.mobile,
    alt: "",
    sizes: "100vw",
  });

  return (
    <section id="spotlight" className="game-spotlight" aria-labelledby="spotlight-heading">
      <h1 id="spotlight-heading" className="sr-only">Game Spotlight</h1>
      <Tabs.Root className="spotlight-tabs" value={selectedGame.slug} onValueChange={onSelectGame}>
        <picture className="spotlight-visual">
          <source media="(max-width: 539px)" srcSet={mobileImage.srcSet} sizes={mobileImage.sizes} />
          <img {...wideImage} className="spotlight-art" />
        </picture>
        <Tabs.List className="spotlight-games" aria-label="Choose a featured game">
          <div className="page-width spotlight-game-grid">
            {spotlightOrder.map((game) => (
              <Tabs.Trigger className="spotlight-game" key={game.slug} value={game.slug}>
                {game.name}
              </Tabs.Trigger>
            ))}
          </div>
        </Tabs.List>
        <div className="spotlight-stage">
          {games.map((game) => (
            <Tabs.Content className="spotlight-slide" key={game.slug} value={game.slug}>
              <div className="page-width spotlight-inner">
                <div className="spotlight-copy">
                  <p className="spotlight-kicker">Game Spotlight</p>
                  <h2>{game.name}</h2>
                  <p className="spotlight-description">{game.items}</p>
                  <Button asChild variant="hero">
                    <a href="#marketplace">
                      Browse game items <MarketplaceIcon name="arrow" data-icon="inline-end" />
                    </a>
                  </Button>
                </div>
              </div>
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </section>
  );
}
