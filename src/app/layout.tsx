import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import "@fontsource/kantumruy-pro/latin-400.css";
import "@fontsource/kantumruy-pro/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOTBIT | Game Item Marketplace",
  description: "Explore in-game items and collectibles on the NOTBIT Sepolia testnet marketplace.",
};

const themeStorageKey = "orbit-color-theme";
const restoreTheme = `try {
  const theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === "scifi") document.documentElement.dataset.theme = theme;
} catch {}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script id="restore-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: restoreTheme }} />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-10 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
        <header className="site-header">
          <nav aria-label="Main navigation" className="page-width site-nav">
            <div className="flex items-center gap-7">
              <Link className="site-brand" href="/" aria-label="NOTBIT home">
                <MarketplaceIcon name="notbit" />
                <span>NOTBIT</span>
              </Link>
              <Link className="header-discover hidden sm:inline-flex" href="/#marketplace">Item Store</Link>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <p className="testnet-label"><span className="hidden sm:inline">Sepolia </span>testnet<span className="sr-only sm:not-sr-only"> · No real funds</span></p>
              <ThemeToggle storageKey={themeStorageKey} />
              <Button asChild variant="quiet" size="compact"><Link href="/account">
                <MarketplaceIcon name="wallet" data-icon="inline-start" />
                Wallet
              </Link></Button>
            </div>
          </nav>
        </header>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
