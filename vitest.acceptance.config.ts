import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { BaseSequencer, type TestSpecification } from "vitest/node";

class OrderedSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) { return files.sort((a,b) => a.moduleId.localeCompare(b.moduleId)); }
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/acceptance/[0-9][0-9]-*.spec.ts"], fileParallelism: false, sequence: { sequencer: OrderedSequencer }, testTimeout: 120_000, hookTimeout: 120_000, bail: 1 },
});
