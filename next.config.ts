import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["devbox"],
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: {
      // Wearable/selfie uploads are posted as server action bodies; match the
      // MAX_UPLOAD_SIZE server-side cap (10 MB).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
