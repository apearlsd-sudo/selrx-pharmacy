import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from "next";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

const nextConfig: NextConfig = {
  typescript: {
    // TODO: Set to false once all 325 pre-existing TS errors are fixed.
    // Currently true to allow Vercel deployment while errors are resolved.
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Tauri requires static export. When building for desktop (npm run build:tauri),
  // the output is written to `out/` which Tauri serves from the WebView.
  // The web build (npm run build) does NOT use this — it produces a .next/ folder
  // as normal for Vercel deployment.
  output: isTauri ? "export" : undefined,

  // Security headers for all responses
  async headers() {
    return [
      // Service worker: no-cache so browsers always get the latest version
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Content-Security-Policy for web deployment
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self' https://vercel.live; manifest-src 'self' https://vercel.com; connect-src 'self' https://*.turso.tech https://*.vercel.app https://*.space-z.ai https://vercel.live https://*.sentry.io https://vercel.com",
          },
        ],
      },
      // CORS for API routes (web deployment only)
      ...(isTauri
        ? []
        : [
            {
              source: "/api/(.*)",
              headers: [
                {
                  key: "Access-Control-Allow-Origin",
                  value: process.env.NEXT_PUBLIC_APP_URL || "https://selrx.vercel.app",
                },
                { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
                {
                  key: "Access-Control-Allow-Headers",
                  value: "Authorization,Content-Type,Accept",
                },
                { key: "Access-Control-Allow-Credentials", value: "true" },
              ],
            },
          ]),
    ];
  },

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

export default withSentryConfig(nextConfig, {
  // Disable Sentry during build to avoid needing DSN at build time
  disableLogger: true,
  // Don't bundle Sentry server-side in Tauri builds
  disableServerWebpackPlugin: !!process.env.TAURI_ENV_PLATFORM,
  disableClientWebpackPlugin: !!process.env.TAURI_ENV_PLATFORM,
  // Suppress source map upload warnings
  silent: true,
})
