"use client";

import { Button } from "@/components/ui/button";
import { MarketplaceIcon } from "@/components/marketplace-icon";

export function ThemeToggle({ storageKey }: { storageKey: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "scifi" ? "dark" : "scifi";
    root.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // The current page can still change theme if storage is unavailable.
    }
  }

  return (
    <Button type="button" variant="quiet" size="icon" onClick={toggleTheme}>
      <span className="theme-icon-dark">
        <MarketplaceIcon name="moon" data-icon="inline-start" />
        <span className="sr-only">Switch to Sci-Fi mode</span>
      </span>
      <span className="theme-icon-scifi">
        <MarketplaceIcon name="sparkles" data-icon="inline-start" />
        <span className="sr-only">Switch to dark mode</span>
      </span>
    </Button>
  );
}
