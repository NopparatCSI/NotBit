import { expect, test } from "@playwright/test";

test("demo storefront and account page work on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("NOTBIT | Game Item Marketplace");
  await expect(page.getByRole("link", { name: "NOTBIT home" })).toBeVisible();
  const iconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  if (!iconHref) throw new Error("Missing site icon.");
  const icon = await page.request.get(iconHref);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  await expect(page.getByText(/testnet/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Game Spotlight" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Item Store" })).toBeVisible();
  await expect.poll(() => page.locator(".spotlight-art").evaluate((image: HTMLImageElement) => image.currentSrc))
    .toContain("warframe-spotlight-mobile");
  await expect(page.getByRole("tab")).toHaveCount(6);
  for (const game of ["Counter-Strike 2", "Team Fortress 2", "Warframe", "Dota 2", "Rust", "Unturned"]) {
    await expect(page.getByRole("tab", { name: game })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("link", { name: "Wallet" }).click();
  await expect(page).toHaveURL((url) => url.hostname === "localhost" && url.pathname === "/account");
  await expect(page.getByRole("button", { name: "Sign in with MetaMask" })).toBeDisabled();

  const response = await page.request.get("/api/v1/me");
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
});

test("search and keyboard-operated item filters stay within the selected game", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Team Fortress 2" }).click();
  const search = page.getByRole("searchbox");
  await expect(search).toHaveAccessibleName("Search items in Team Fortress 2");
  const count = page.getByRole("status");
  await search.fill("  engineer  ");
  await expect(count).toHaveText("1 item");
  await expect(page.getByRole("heading", { name: "Field Engineer’s Cap" })).toBeVisible();

  await page.getByRole("radio", { name: "All items" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Weapons" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Weapons" })).toBeChecked();
  await expect(count).toHaveText("0 items");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toBeFocused();
  await expect(count).toHaveText("1 item");

  await page.getByRole("radio", { name: "Cosmetics" }).click();
  await expect(count).toHaveText("1 item");
  await page.getByRole("radio", { name: "Taunts" }).click();
  await expect(page.getByText("No sample listings in Taunts.")).toBeVisible();
  await search.fill("prime");
  await expect(count).toHaveText("0 items");

  await page.getByRole("tab", { name: "Counter-Strike 2" }).click();
  await expect(search).toHaveAccessibleName("Search items in Counter-Strike 2");
  await expect(search).toHaveValue("");
  await expect(page.getByRole("radio", { name: "All items" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Taunts" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Stickers" })).toBeVisible();
  await search.fill("weapon skins");
  await expect(page.getByRole("heading", { name: "Carbon Weapon Skin" })).toBeVisible();
  await expect(count).toHaveText("1 item");
});

test("spotlight switches on click and arrow keys and browses the selected game's items", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const backdrop = page.locator(".spotlight-art");
  await expect(backdrop).toHaveAttribute("src", /warframe-spotlight[.]/i);
  await expect(backdrop).toHaveCSS("filter", "none");
  const tabs = page.getByRole("tablist");
  await expect(tabs).toHaveCSS("backdrop-filter", "blur(12px)");
  const backdropBounds = await backdrop.boundingBox();
  const tabsBounds = await tabs.boundingBox();
  expect(backdropBounds && tabsBounds && (backdropBounds.y + backdropBounds.height) - (tabsBounds.y + tabsBounds.height))
    .toBeCloseTo(0, 1);
  await expect(page.getByRole("tabpanel")).toContainText("Mods and Prime parts");
  await expect(page.locator(".store-banner img")).toHaveCount(0);
  await expect(page.getByRole("tablist").locator("img")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Prime parts" })).toBeVisible();
  await page.getByRole("tab", { name: "Counter-Strike 2" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Weapon skins");
  await expect(backdrop).toHaveAttribute("src", /counter-strike-2-spotlight[.]/i);
  await expect(page.locator(".store-banner-title")).toContainText("Counter-Strike 2");

  await page.keyboard.press("ArrowRight");
  const teamTab = page.getByRole("tab", { name: "Team Fortress 2" });
  await expect(teamTab).toBeFocused();
  await expect(teamTab).toHaveAttribute("aria-selected", "true");
  const preview = page.getByRole("tabpanel");
  await expect(preview).toContainText("Hats and cosmetics");
  await expect(backdrop).toHaveAttribute("src", /team-fortress-2-spotlight[.]/i);
  await expect(preview.locator(".spotlight-copy")).toHaveCSS("animation-name", "none");
  await preview.getByRole("link", { name: "Browse game items" }).click();
  await expect(page).toHaveURL(/#marketplace$/);
  await expect(page.locator(".store-banner-title")).toContainText("Team Fortress 2");
  await expect(page.getByRole("searchbox", { name: "Search items in Team Fortress 2" })).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText("1 item");
  await expect(page.getByRole("heading", { name: "Field Engineer’s Cap" })).toBeVisible();
});

test("the extra games each open their own item categories and sample listings", async ({ page }) => {
  await page.goto("/");

  for (const { name, slug, category, item } of [
    { name: "Dota 2", slug: "dota-2", category: "Hero cosmetics", item: "Silver Mantle" },
    { name: "Rust", slug: "rust", category: "Clothing skins", item: "Frontier Jacket" },
    { name: "Unturned", slug: "unturned", category: "Backpacks", item: "Field Pack" },
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.locator(".spotlight-art")).toHaveAttribute("src", new RegExp(`${slug}-spotlight[.]`));
    await expect(page.locator(".store-banner-title")).toContainText(name);
    await page.getByRole("radio", { name: category, exact: true }).click();
    await expect(page.getByRole("heading", { name: item })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("1 item");
  }
});

test("the icon switches Dark and Sci-Fi, remembers the choice, and retires saved Light mode", async ({ page }) => {
  const scriptWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Encountered a script tag")) {
      scriptWarnings.push(message.text());
    }
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    if (!localStorage.getItem("orbit-color-theme")) {
      localStorage.setItem("orbit-color-theme", "light");
    }
  });
  await page.goto("/");
  const root = page.locator("html");
  const background = page.locator("body");
  const sciFiToggle = page.getByRole("button", { name: "Switch to Sci-Fi mode" });
  const darkToggle = page.getByRole("button", { name: "Switch to dark mode" });
  const moon = page.locator(".theme-icon-dark svg");
  const sparkles = page.locator(".theme-icon-scifi svg");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(background).toHaveCSS("background-color", "rgb(16, 16, 16)");
  await expect(moon).toBeVisible();
  await expect(sparkles).toBeHidden();
  await page.getByRole("tab", { name: "Dota 2" }).click();
  await sciFiToggle.click();
  await expect(root).toHaveAttribute("data-theme", "scifi");
  await expect(background).toHaveCSS("background-color", "rgb(26, 20, 44)");
  await expect(sparkles).toBeVisible();
  await expect(moon).toBeHidden();
  await expect(page.getByRole("tab", { name: "Dota 2" })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "scifi");
  await expect(sparkles).toBeVisible();
  await darkToggle.click();
  await expect(background).toHaveCSS("background-color", "rgb(16, 16, 16)");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(sciFiToggle).toBeVisible();
  await expect(moon).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Staff console" })).toBeVisible();
  await page.getByRole("link", { name: "NOTBIT home" }).click();
  await expect(page.getByRole("heading", { name: "Item Store" })).toBeVisible();
  expect(scriptWarnings).toEqual([]);
});
