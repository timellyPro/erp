import {
  buildCollectionByHeadSummary,
  getDayReportAllocationsForTx,
  type CollectionByHeadRow,
} from "@/lib/feeDayReportExcel";
import { loadFeeReportTransactions } from "@/lib/loadDayFeeCollectionTransactions";
import type { DayReportTx } from "@/lib/feeDayReportExcel";
import {
  aggregateCollectionByMethod,
  formatCollectionAmount,
  todayYmdLocal,
} from "@/lib/schoolDashboardCollection";

function formatCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function collectionDateRange(fromYmd?: string, toYmd?: string): { from: string; to: string } {
  const from = fromYmd?.trim() || todayYmdLocal();
  const to = toYmd?.trim() || from;
  return { from, to };
}

const dayTxsMemory = new Map<
  string,
  { at: number; value: { from: string; to: string; txs: DayReportTx[] } }
>();
const dayTxsInflight = new Map<string, Promise<{ from: string; to: string; txs: DayReportTx[] }>>();
const DAY_TXS_TTL_MS = 90_000;

async function loadDayReportTransactions(
  schoolId: string,
  fromYmd?: string,
  toYmd?: string
): Promise<{ from: string; to: string; txs: DayReportTx[] }> {
  const range = collectionDateRange(fromYmd, toYmd);
  const cacheKey = `${schoolId}:${range.from}:${range.to}`;
  const cached = dayTxsMemory.get(cacheKey);
  if (cached && Date.now() - cached.at < DAY_TXS_TTL_MS) {
    return cached.value;
  }

  const running = dayTxsInflight.get(cacheKey);
  if (running) return running;

  const run = (async () => {
    const txs = await loadFeeReportTransactions(schoolId, range.from, range.to);
    const value = { ...range, txs };
    dayTxsMemory.set(cacheKey, { at: Date.now(), value });
    return value;
  })();

  dayTxsInflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    dayTxsInflight.delete(cacheKey);
  }
}

/** Summary + fee-head breakdown from one transaction load (dashboard fast path). */
export async function buildSchoolDashboardDayCollectionBundle(
  schoolId: string,
  fromYmd?: string,
  toYmd?: string
): Promise<{
  summary: SchoolDashboardCollectionSummary;
  byHead: SchoolDashboardCollectionByHead;
}> {
  const { from, to, txs } = await loadDayReportTransactions(schoolId, fromYmd, toYmd);
  const byHead = buildCollectionByHeadSummary(txs);
  const { rows, total } = buildMethodSummaryFromTransactions(txs);
  return {
    summary: {
      collectionDate: from,
      collectionFrom: from,
      collectionTo: to,
      todayCollectionTotal: formatCurrency(total),
      todayCollectionTotalRaw: total,
      todayCollectionByMethod: rows.map((m) => ({
        key: m.key,
        label: m.label,
        amount: Math.round(m.amount * 100) / 100,
        formattedAmount: formatCollectionAmount(m.amount),
        count: m.count,
      })),
    },
    byHead,
  };
}

function buildMethodSummaryFromTransactions(txs: DayReportTx[]) {
  const pseudoPayments = txs.map((tx) => ({
    amount: getDayReportAllocationsForTx(tx).reduce(
      (sum, al) => sum + (Number(al.amount) || 0),
      0
    ),
    gateway: tx.gateway ?? null,
    count: 1,
  }));
  return aggregateCollectionByMethod(pseudoPayments);
}

export type SchoolDashboardCollectionSummary = {
  collectionDate: string;
  collectionFrom?: string;
  collectionTo?: string;
  todayCollectionTotal: string;
  todayCollectionTotalRaw: number;
  todayCollectionByMethod: Array<{
    key: string;
    label: string;
    amount: number;
    formattedAmount: string;
    count: number;
  }>;
};

export type SchoolDashboardCollectionByHead = {
  rows: CollectionByHeadRow[];
  total: number;
  formattedTotal: string;
};

export type SchoolDashboardCollectionPayload = SchoolDashboardCollectionSummary & {
  todayCollectionByHead: SchoolDashboardCollectionByHead;
};

/** Cash/online totals — allocation sums (matches day report Excel). */
export async function buildSchoolDashboardCollectionSummary(
  schoolId: string,
  fromYmd?: string,
  toYmd?: string
): Promise<SchoolDashboardCollectionSummary> {
  const { from, to, txs } = await loadDayReportTransactions(schoolId, fromYmd, toYmd);
  const { rows, total } = buildMethodSummaryFromTransactions(txs);

  return {
    collectionDate: from,
    collectionFrom: from,
    collectionTo: to,
    todayCollectionTotal: formatCurrency(total),
    todayCollectionTotalRaw: total,
    todayCollectionByMethod: rows.map((m) => ({
      key: m.key,
      label: m.label,
      amount: Math.round(m.amount * 100) / 100,
      formattedAmount: formatCollectionAmount(m.amount),
      count: m.count,
    })),
  };
}

/** Fee-head breakdown — same transactions as day report export. */
export async function buildSchoolDashboardCollectionByHead(
  schoolId: string,
  fromYmd?: string,
  toYmd?: string
): Promise<SchoolDashboardCollectionByHead> {
  const { txs } = await loadDayReportTransactions(schoolId, fromYmd, toYmd);
  return buildCollectionByHeadSummary(txs);
}

/** Full payload — single load, summary + heads aligned with Excel. */
export async function buildSchoolDashboardCollection(
  schoolId: string,
  fromYmd?: string,
  toYmd?: string
): Promise<SchoolDashboardCollectionPayload> {
  const { from, to, txs } = await loadDayReportTransactions(schoolId, fromYmd, toYmd);
  const byHead = buildCollectionByHeadSummary(txs);
  const { rows, total } = buildMethodSummaryFromTransactions(txs);

  return {
    collectionDate: from,
    collectionFrom: from,
    collectionTo: to,
    todayCollectionTotal: formatCurrency(total),
    todayCollectionTotalRaw: total,
    todayCollectionByMethod: rows.map((m) => ({
      key: m.key,
      label: m.label,
      amount: Math.round(m.amount * 100) / 100,
      formattedAmount: formatCollectionAmount(m.amount),
      count: m.count,
    })),
    todayCollectionByHead: byHead,
  };
}
