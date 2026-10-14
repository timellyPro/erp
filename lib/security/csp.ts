/**
 * Content-Security-Policy with a per-request nonce.
 *
 * `script-src` allows only scripts that carry the request's nonce (Next.js stamps it onto its own
 * framework/page scripts when it is present in the request's CSP header) plus scripts those load
 * (`'strict-dynamic'`). There is no `'unsafe-inline'` for scripts, so an injected `<script>` or
 * inline event handler cannot run. Styles keep `'unsafe-inline'` (CSS-in-JS/inline style props).
 *
 * Runs in the edge middleware, so it must only use Web APIs (no Node `crypto` import).
 */

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
  ].join("; ");
}
