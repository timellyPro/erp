import type { CatalogFeeHeadOption } from "@/lib/extraFeeCatalogOptions";
import type { ClassRow } from "@/lib/extraFeeCatalogFilter";

export type AssignFeeCatalogResult = {
  dbFeeHeadOptions: CatalogFeeHeadOption[];
  existingStudentExtras: Array<{
    id: string;
    name: string;
    amount: number;
    splitIntoTwoInstallments: boolean;
  }>;
  classBaseFeeTotal: number | null;
  classRows: ClassRow[];
  resolvedClassId: string | null;
  resolvedSection: string | null;
};

const MEMORY_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = "erp:assign-fee-catalog:v1";

const memory = new Map<string, { expiresAt: number; value: AssignFeeCatalogResult }>();

type SessionStore = Record<string, { savedAt: number; value: AssignFeeCatalogResult }>;

export function assignCatalogCacheKey(params: {
  studentId: string;
  classId?: string | null;
  section?: string | null;
  residencyType?: string | null;
}): string {
  return [
    params.studentId,
    params.classId ?? "",
    params.section ?? "",
    params.residencyType ?? "",
  ].join("|");
}

function readSession(): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as SessionStore;
  } catch {
    return {};
  }
}

function writeSession(store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function peekAssignFeeCatalog(params: {
  studentId: string;
  classId?: string | null;
  section?: string | null;
  residencyType?: string | null;
}): AssignFeeCatalogResult | null {
  return getAssignCatalogCache(assignCatalogCacheKey(params));
}

export function getAssignCatalogCache(key: string): AssignFeeCatalogResult | null {
  const mem = memory.get(key);
  if (mem && Date.now() < mem.expiresAt) return mem.value;

  const store = readSession();
  const entry = store[key];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[key];
      writeSession(store);
    }
    return null;
  }
  return entry.value;
}

export function setAssignCatalogCache(key: string, value: AssignFeeCatalogResult): void {
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt: Date.now(), value };
  writeSession(store);
}

export function invalidateAssignCatalogCache(studentId?: string): void {
  if (!studentId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${studentId}|`)) memory.delete(key);
  }
  const store = readSession();
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${studentId}|`)) delete store[key];
  }
  writeSession(store);
}
