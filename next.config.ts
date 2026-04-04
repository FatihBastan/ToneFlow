import type { NextConfig } from "next";

const isMobile = !!process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  // Static export for Capacitor mobile builds
  ...(isMobile && { output: "export" }),
  images: {
    // Static export requires unoptimized images
    ...(isMobile && { unoptimized: true }),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
};

export default nextConfig;
