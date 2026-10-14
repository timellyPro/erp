import { timingSafeEqual } from "crypto";

/**
 * Shared secret for server-to-server calls to our own API (e.g. PDF generation
 * fetching /api/media). Prefer a dedicated INTERNAL_API_SECRET; falling back to
 * NEXTAUTH_SECRET keeps existing deployments working until it is set, but means
 * a leaked header would expose the JWT signing key.
 */
export function getInternalSecret(): string | undefined {
  return process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET || undefined;
}

export function isValidInternalSecret(provided: string | null | undefined): boolean {
  const secret = getInternalSecret();
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
