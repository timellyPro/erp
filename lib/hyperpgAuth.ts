/**
 * HyperPG / Juspay-style Basic auth for API calls.
 * - `merchant_key`: Base64("merchantId:apiKey")
 * - `api_key` (default): Base64("apiKey:") — username = key, empty password (same as curl `-u API_KEY:`)
 */
export function hyperpgBasicAuthBase64(opts: {
  apiKeyClean: string;
  merchantIdClean: string;
  authStyle: string;
}): string {
  const { apiKeyClean, merchantIdClean, authStyle } = opts;
  if (authStyle === "merchant_key" && merchantIdClean) {
    return Buffer.from(`${merchantIdClean}:${apiKeyClean}`, "utf8").toString("base64");
  }
  return Buffer.from(`${apiKeyClean}:`, "utf8").toString("base64");
}

/**
 * Juspay/HyperPG Session API: `payment_page_client_id` is required; dashboard value often matches merchant id.
 * Prefer HYPERPG_CLIENT_ID when set; otherwise use merchant id; last resort "test" (sandbox only).
 */
export function resolveHyperpgPaymentPageClientId(merchantIdClean: string): string {
  const fromEnv = process.env.HYPERPG_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  if (merchantIdClean) return merchantIdClean;
  return "test";
}

/** JSON session POST: x-merchantid + x-routing-id per Juspay Session API docs. */
export function hyperpgSessionJsonHeaders(
  authB64: string,
  merchantIdClean: string,
  routingId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Basic ${authB64}`,
    "User-Agent": "Timelly-ERP/1.0 (HyperPG session)",
  };
  if (merchantIdClean) {
    headers["x-merchantid"] = merchantIdClean;
  }
  const rid = (routingId ?? "").trim().slice(0, 128);
  if (rid) {
    headers["x-routing-id"] = rid;
  }
  return headers;
}
