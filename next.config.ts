import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["devbox"],
  // `pino-opentelemetry-transport` is loaded by name inside a pino transport
  // worker thread, so it must be resolved from node_modules at runtime.
  serverExternalPackages: ["sharp", "pino-opentelemetry-transport"],
  experimental: {
    serverActions: {
      // Uploads are posted via server actions, one image per request; match
      // the MAX_UPLOAD_SIZE default in src/server/settings.ts. Must also stay
      // below Vercel's 4.5 MB request-body limit.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
