import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Turbopack watches only this project root.
  // Without this, Next can pick a parent folder when multiple lockfiles exist,
  // causing frequent full reloads from unrelated file changes.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
