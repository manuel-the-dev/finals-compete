import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages must never be bundled into client components.
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
};

export default nextConfig;
