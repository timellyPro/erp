export type ApprovalStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export type ApprovalRow = {
  id: string;
  status: ApprovalStatus;
  totalFee: number;
  discountPercent: number;
  discountFixedAmount: number | null;
  finalFee: number;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
  reviewRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student: {
    id: string;
    admissionNumber: string;
    fatherName?: string | null;
    user: { name: string | null } | null;
    class: { name: string; section: string | null } | null;
  };
  requestedBy: { name: string | null; email: string | null } | null;
  reviewedBy: { name: string | null; email: string | null } | null;
};

export const formatMoney = (value: number | null | undefined) =>
  `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

export const classLabel = (row: ApprovalRow) =>
  row.student.class
    ? [row.student.class.name, row.student.class.section].filter(Boolean).join(" - ")
    : "-";

const approvalsCache = new Map<ApprovalStatus, { data: ApprovalRow[]; ts: number }>();
const approvalsInflight = new Map<ApprovalStatus, Promise<ApprovalRow[]>>();
const APPROVALS_CACHE_MS = 5 * 60_000;
const SESSION_CACHE_KEY = "chairman:discount-approvals:v1";

type SessionApprovalCache = Partial<Record<ApprovalStatus, { data: ApprovalRow[]; ts: number }>>;

export function readSessionApprovals(status: ApprovalStatus): ApprovalRow[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    const hit = store[status];
    if (!hit || Date.now() - hit.ts > APPROVALS_CACHE_MS) return null;
    approvalsCache.set(status, hit);
    return hit.data;
  } catch {
    return null;
  }
}

function writeSessionApprovals(status: ApprovalStatus, data: ApprovalRow[]): void {
  approvalsCache.set(status, { data, ts: Date.now() });
  if (typeof sessionStorage === "undefined") return;
  try {
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    store[status] = { data, ts: Date.now() };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function clearApprovalCaches(status?: ApprovalStatus): void {
  if (status) approvalsCache.delete(status);
  else approvalsCache.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!status) {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return;
    }
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    delete store[status];
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getCachedApprovals(status: ApprovalStatus): ApprovalRow[] | undefined {
  return approvalsCache.get(status)?.data;
}

export async function requestApprovals(status: ApprovalStatus): Promise<ApprovalRow[]> {
  const request =
    approvalsInflight.get(status) ??
    fetch(`/api/fees/discount-approvals?status=${status}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to load approvals");
        return Array.isArray(data.approvals) ? data.approvals : [];
      })
      .finally(() => {
        approvalsInflight.delete(status);
      });

  approvalsInflight.set(status, request);
  const next = await request;
  writeSessionApprovals(status, next);
  return next;
}

export function warmDiscountApprovals(status: ApprovalStatus = "PENDING"): void {
  const cached = getCachedApprovals(status) ?? readSessionApprovals(status);
  if (cached || approvalsInflight.has(status)) return;
  void requestApprovals(status).catch(() => {});
}
