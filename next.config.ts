import type { NextConfig } from "next";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Tauri requires static export. When building for desktop (npm run build:tauri),
  // the output is written to `out/` which Tauri serves from the WebView.
  // The web build (npm run build) does NOT use this — it produces a .next/ folder
  // as normal for Vercel deployment.
  output: isTauri ? "export" : undefined,

  // On web builds, alias @tauri-apps/api/core to a no-op stub so the bundler
  // can resolve the import without needing the real Tauri-only package.
  // In Tauri desktop builds (TAURI_ENV_PLATFORM is set), the real package
  // is installed and used directly — no alias needed.
  ...(isTauri
    ? {}
    : {
        turbopack: {
          resolveAlias: {
            '@tauri-apps/api/core': './src/lib/desktop/tauri-stub.ts',
          },
        },
      }),
};

export default nextConfig;
