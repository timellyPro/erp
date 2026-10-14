import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Disabled: Strict Mode's dev-only double-effect-invoke was firing every data-loading
  // effect twice on mount (visible as an aborted/canceled request in the Network tab
  // followed by a second successful one). Harmless in practice — effects already ignore
  // AbortError — but noisy to debug against. No effect on production builds either way.
  reactStrictMode: false,
  poweredByHeader: false,
  // Content-Security-Policy is set per request (with a nonce) in middleware.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  // Ensure Turbopack watches only this project root.
  // Without this, Next can pick a parent folder when multiple lockfiles exist,
  // causing frequent full reloads from unrelated file changes.
  turbopack: {
    root: process.cwd(),
  },
};

// Source-map upload only happens when SENTRY_AUTH_TOKEN is set (Vercel env).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
