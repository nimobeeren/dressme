import "./src/env/server";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["devbox"],
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: {
      // Uploads are posted via server actions, one image per request; match
      // the NEXT_PUBLIC_MAX_UPLOAD_SIZE default in src/env/client.ts. Must also
      // stay below Vercel's 4.5 MB request-body limit.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
