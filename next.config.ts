import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Disabled: Strict Mode's dev-only double-effect-invoke was firing every data-loading
  // effect twice on mount (visible as an aborted/canceled request in the Network tab
  // followed by a second successful one). Harmless in practice — effects already ignore
  // AbortError — but noisy to debug against. No effect on production builds either way.
  reactStrictMode: false,
  poweredByHeader: false,
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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
              "connect-src 'self' https: wss:",
              "worker-src 'self' blob:",
            ].join("; "),
          },
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
