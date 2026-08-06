import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Tauri requires static export. When building for desktop (npm run build:tauri),
  // the output is written to `out/` which Tauri serves from the WebView.
  // The web build (npm run build) does NOT use this — it produces a .next/ folder
  // as normal for Vercel deployment.
  output: process.env.TAURI_ENV_PLATFORM ? "export" : undefined,
};

export default nextConfig;
