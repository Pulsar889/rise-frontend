import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["jito-ts", "@pythnetwork/pyth-solana-receiver", "@pythnetwork/price-service-sdk"],
  turbopack: {
    resolveAlias: {
      buffer: "buffer",
    },
  },
};

export default nextConfig;
