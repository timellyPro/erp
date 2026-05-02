/**
 * Origin used to build HyperPG `return_url` (order: dedicated override → public app URL → Vercel preview → NextAuth → localhost).
 */
export function resolveHyperpgAppBaseUrl(): string {
  const trim = (s: string | undefined) => (s ?? "").trim().replace(/\/$/, "");
  const explicit =
    trim(process.env.HYPERPG_RETURN_URL) || trim(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;
  const vercelHost = trim(process.env.VERCEL_URL);
  if (vercelHost && process.env.VERCEL === "1") {
    return `https://${vercelHost}`;
  }
  const auth = trim(process.env.NEXTAUTH_URL);
  if (auth) return auth;
  return "http://localhost:3000";
}

/**
 * HyperPG's edge rejects some return_url hosts with HTML 403 (before auth JSON).
 * Observed: localhost, 127.0.0.1, https://localhost, common private IPv4 ranges.
 */
export function hyperpgReturnUrlHostBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost")) {
    return true;
  }
  if (h.endsWith(".local")) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d{1,3})\./.exec(h);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function assertHyperpgSessionReturnUrl(returnUrl: string): { ok: true } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(returnUrl);
  } catch {
    return { ok: false, message: "return_url is not a valid URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, message: "return_url must be http or https." };
  }
  if (hyperpgReturnUrlHostBlocked(u.hostname)) {
    return {
      ok: false,
      message:
        "HyperPG blocks return_url on localhost / private IPs (you would get HTML 403). Set HYPERPG_RETURN_URL or NEXT_PUBLIC_APP_URL to a public https origin (e.g. ngrok). For sandbox-only local testing without a tunnel, set HYPERPG_USE_SANDBOX_PLACEHOLDER_RETURN=1 — checkout works but after pay users land on HyperPG, not your app.",
    };
  }
  return { ok: true };
}

/** Public https URL HyperPG accepts when real app origin is blocked (sandbox smoke tests only). */
export const HYPERPG_SANDBOX_PLACEHOLDER_RETURN_URL = "https://sandbox.hyperpg.in/";

export function hyperpgSandboxPlaceholderReturnEnabled(): boolean {
  const v = process.env.HYPERPG_USE_SANDBOX_PLACEHOLDER_RETURN;
  return v === "1" || v === "true";
}
