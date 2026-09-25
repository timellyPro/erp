import type { TransactionItem } from "@/app/frontend/components/schooladmin/fees/RefundModal";
import { peekLastFeesSchoolId } from "@/lib/schoolFeesPageClientCache";

const MEMORY_TTL_MS = 60_000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const SESSION_KEY = "erp:fees-transactions:v1";

type Entry = { savedAt: number; transactions: TransactionItem[] };
type Store = Record<string, Entry>;

const memory = new Map<string, { expiresAt: number; value: TransactionItem[] }>();

function readSession(): Store {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function writeSession(store: Store): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function peekFeesTransactions(schoolId: string): TransactionItem[] | null {
  const mem = memory.get(schoolId);
  if (mem && Date.now() < mem.expiresAt) return mem.value;
  const entry = readSession()[schoolId];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) return null;
  return entry.transactions;
}

export function resolveFeesTransactionsCacheKey(schoolId?: string | null): string {
  return schoolId ?? peekLastFeesSchoolId() ?? "__fees_tx_session__";
}

export function setFeesTransactionsCache(schoolId: string, transactions: TransactionItem[]): void {
  if (transactions.length === 0) return;
  memory.set(schoolId, { value: transactions, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[schoolId] = { savedAt: Date.now(), transactions };
  writeSession(store);
}

export function invalidateFeesTransactionsCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  memory.delete(schoolId);
  const store = readSession();
  delete store[schoolId];
  writeSession(store);
}

const inflight = new Map<string, Promise<TransactionItem[]>>();

export async function fetchFeesTransactions(
  schoolId: string | null | undefined,
  options?: { signal?: AbortSignal; revalidate?: boolean; collectedByUserId?: string; limit?: number }
): Promise<TransactionItem[]> {
  const collectorPart = options?.collectedByUserId ? `:collector:${options.collectedByUserId}` : "";
  const limitPart = options?.limit ? `:limit:${options.limit}` : "";
  const cacheKey = `${resolveFeesTransactionsCacheKey(schoolId)}${collectorPart}${limitPart}`;

  if (!options?.revalidate && !options?.collectedByUserId) {
    const cached = peekFeesTransactions(cacheKey);
    if (cached && cached.length > 0) return cached;
  }

  const running = inflight.get(cacheKey);
  if (running) return running;

  const run = (async () => {
    const qs = new URLSearchParams({ limit: String(options?.limit ?? 200) });
    if (options?.collectedByUserId) {
      qs.set("collectedByUserId", options.collectedByUserId);
    }
    if (options?.revalidate) {
      qs.set("refresh", "1");
    }
    const res = await fetch(`/api/fees/transactions?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || "Failed to load transactions");
    }
    const list = (Array.isArray(data.transactions) ? data.transactions : []) as TransactionItem[];
    if (list.length > 0 && !options?.collectedByUserId) {
      setFeesTransactionsCache(cacheKey, list);
    }
    return list;
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}
