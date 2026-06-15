import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit a minimal standalone server bundle (server.js + only the required
  // node_modules) so the production Docker image stays small and boots fast.
  // The runner stage copies only .next/standalone instead of the whole tree.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
