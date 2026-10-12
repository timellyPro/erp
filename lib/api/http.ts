import type { ZodType } from "zod";

/**
 * Small fetch wrapper shared by the lib/api/<feature>.ts modules.
 *
 * Feature state hooks (useXState) previously called `fetch(...)` directly,
 * mixed in with their loading flags and form state. Pulling the network
 * call + JSON parsing out into lib/api/<feature>.ts (which all use this
 * helper) separates "how we talk to the server" from "what the component
 * needs" — the hook gets back a typed `{ ok, status, data }` and keeps its
 * existing error-message / state-update logic unchanged.
 */
export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function apiRequest<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const res = await fetch(input, { credentials: "include", ...init });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function apiGet<T = unknown>(
  input: string,
  init?: Omit<RequestInit, "method">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, { ...init, method: "GET" });
}

export function apiPost<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T = unknown>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, "method" | "body">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = unknown>(
  input: string,
  init?: Omit<RequestInit, "method">
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, { ...init, method: "DELETE" });
}

/**
 * Validates a parsed JSON response against a zod schema — the typed half of
 * the API boundary (see lib/api/*.ts) that pairs with each route's own
 * request-shape validation. Never throws: on a mismatch it logs a warning
 * and returns the raw data unchanged, so a server-side field rename or bug
 * degrades to "log and keep working" rather than a hard client crash. This
 * keeps the schema purely descriptive/diagnostic on the client — it never
 * blocks a response from reaching the hook that asked for it.
 */
export function validateApiResponse<T>(schema: ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[api] Unexpected response shape for ${context}:`, result.error);
    }
    return data as T;
  }
  return result.data as T;
}
