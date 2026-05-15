import prisma from "@/lib/db";
import {
  aggregateCollectionByMethod,
  FEE_COLLECTION_PAYMENT_WHERE,
  localDayBoundsFromYmd,
  todayYmdLocal,
} from "@/lib/schoolDashboardCollection";

function formatCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

/** Fast day collection (groupBy gateway, no full payment rows). */
export async function buildSchoolDashboardCollection(schoolId: string, dateYmd?: string) {
  const dateParam = dateYmd?.trim() || todayYmdLocal();
  const bounds = localDayBoundsFromYmd(dateParam);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const collectionStart = bounds?.start ?? todayStart;
  const collectionEnd = bounds?.end ?? todayEnd;

  const grouped = await prisma.payment.groupBy({
    by: ["gateway"],
    where: {
      student: { schoolId },
      ...FEE_COLLECTION_PAYMENT_WHERE,
      createdAt: { gte: collectionStart, lt: collectionEnd },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const pseudoPayments = grouped.map((g) => ({
    amount: g._sum.amount ?? 0,
    gateway: g.gateway,
  }));

  const { rows, total } = aggregateCollectionByMethod(pseudoPayments);

  return {
    collectionDate: dateParam,
    todayCollectionTotal: formatCurrency(total),
    todayCollectionTotalRaw: total,
    todayCollectionByMethod: rows.map((m) => ({
      key: m.key,
      label: m.label,
      amount: Math.round(m.amount * 100) / 100,
      formattedAmount: `₹${Math.round(m.amount).toLocaleString("en-IN")}`,
      count: m.count,
    })),
  };
}
