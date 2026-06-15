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
  localDayBoundsFromYmd,
  todayYmdLocal,
} from "@/lib/schoolDashboardCollection";

function formatCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function collectionDateParam(dateYmd?: string): string {
  return dateYmd?.trim() || todayYmdLocal();
}

async function loadDayReportTransactions(
  schoolId: string,
  dateYmd?: string
): Promise<{ dateParam: string; txs: DayReportTx[] }> {
  const dateParam = collectionDateParam(dateYmd);
  if (!localDayBoundsFromYmd(dateParam)) {
    return { dateParam, txs: [] };
  }
  const txs = await loadFeeReportTransactions(schoolId, dateParam, dateParam);
  return { dateParam, txs };
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
  dateYmd?: string
): Promise<SchoolDashboardCollectionSummary> {
  const { dateParam, txs } = await loadDayReportTransactions(schoolId, dateYmd);
  const { rows, total } = buildMethodSummaryFromTransactions(txs);

  return {
    collectionDate: dateParam,
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
  dateYmd?: string
): Promise<SchoolDashboardCollectionByHead> {
  const { txs } = await loadDayReportTransactions(schoolId, dateYmd);
  return buildCollectionByHeadSummary(txs);
}

/** Full payload — single load, summary + heads aligned with Excel. */
export async function buildSchoolDashboardCollection(
  schoolId: string,
  dateYmd?: string
): Promise<SchoolDashboardCollectionPayload> {
  const { dateParam, txs } = await loadDayReportTransactions(schoolId, dateYmd);
  const byHead = buildCollectionByHeadSummary(txs);
  const { rows, total } = buildMethodSummaryFromTransactions(txs);

  return {
    collectionDate: dateParam,
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
