import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["devbox"],
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: {
      // Uploads are posted via server actions, one image per request; match
      // the MAX_UPLOAD_SIZE server-side cap.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
