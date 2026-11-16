import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_TEST_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const server = process.env.PLAYWRIGHT_USE_BUILD === "1" ? "next start" : "next dev --webpack";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: `${server} --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    reuseExistingServer: false,
  },
});
