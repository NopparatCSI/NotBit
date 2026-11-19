import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},
  test:{include:["tests/acceptance/sepolia.spec.ts"],testTimeout:900_000,hookTimeout:120_000,bail:1,fileParallelism:false},
});
