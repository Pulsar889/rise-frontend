import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["jito-ts"],
  turbopack: {},
};

export default nextConfig;
