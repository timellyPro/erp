import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disabled: Strict Mode's dev-only double-effect-invoke was firing every data-loading
  // effect twice on mount (visible as an aborted/canceled request in the Network tab
  // followed by a second successful one). Harmless in practice — effects already ignore
  // AbortError — but noisy to debug against. No effect on production builds either way.
  reactStrictMode: false,
  // Ensure Turbopack watches only this project root.
  // Without this, Next can pick a parent folder when multiple lockfiles exist,
  // causing frequent full reloads from unrelated file changes.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
