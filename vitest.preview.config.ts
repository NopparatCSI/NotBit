import {defineConfig} from "vitest/config";
import {fileURLToPath} from "node:url";
export default defineConfig({
  resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},
  test:{include:["tests/preview/*.spec.ts"],testTimeout:1_200_000,hookTimeout:120_000,bail:1,fileParallelism:false},
});
