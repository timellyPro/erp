/**
 * HyperPG base URL: per-school override (superadmin / school settings) or HYPERPG_BASE_URL / sandbox default.
 */
export function defaultHyperpgBaseUrl(): string {
  return (process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in").replace(/\/$/, "");
}

export function resolveHyperpgBaseUrl(options: {
  useGlobalOnly: boolean;
  schoolHyperpgBaseUrl?: string | null;
}): string {
  if (options.useGlobalOnly) return defaultHyperpgBaseUrl();
  const trimmed = options.schoolHyperpgBaseUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  return defaultHyperpgBaseUrl();
}
