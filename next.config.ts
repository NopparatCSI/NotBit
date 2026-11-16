import type { NextConfig } from "next";

export default {
  transpilePackages: ["@marketplace/shared"],
  poweredByHeader: false,
} satisfies NextConfig;
