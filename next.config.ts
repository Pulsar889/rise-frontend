import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["jito-ts"],
  turbopack: {
    resolveAlias: {
      buffer: "buffer",
    },
  },
};

export default nextConfig;
