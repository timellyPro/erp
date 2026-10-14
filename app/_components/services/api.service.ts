import { toast } from "./toast.service";

export type ApiOptions = RequestInit & {
  /** Abort request after this many ms (default 60000). */
  timeoutMs?: number;
};

export async function api(url: string, options?: ApiOptions): Promise<Response> {
  const { timeoutMs: timeoutMsOpt, ...fetchOptions } = options ?? {};
  const timeoutMs = timeoutMsOpt ?? 60000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      credentials: "include",
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText || "Something went wrong" }));
      const msg = (err as { message?: string }).message || "Something went wrong";
      toast.error(msg);
      throw new Error(msg);
    }

    return res;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      toast.error("Request timed out. Check your connection and try again.");
      throw new Error("Request timed out. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiJson<T = unknown>(url: string, options?: ApiOptions): Promise<T> {
  const res = await api(url, options);
  return res.json() as Promise<T>;
}
