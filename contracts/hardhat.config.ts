import { createRequire } from "node:module";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import { defineConfig } from "hardhat/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [hardhatNodeTestRunner],
  solidity: {
    version: "0.8.38",
    path: require.resolve("solc/soljson.js"),
    settings: { evmVersion: "prague", optimizer: { enabled: true, runs: 200 } },
  },
});
