import prisma from "@/lib/db";
import { loadAdmissionFeeDayReportTransactions } from "@/lib/loadAdmissionFeeDayReportTx";

export type FeesComparisonRange = {
  from: string;
  to: string;
};

export type FeesComparisonRow = {
  key: string;
  category: "FEES" | "PETTY_CASH";
  head: string;
  rangeAAmount: number;
  rangeBAmount: number;
  difference: number;
  rangeACount: number;
  rangeBCount: number;
};

export type FeesComparisonReport = {
  rangeA: FeesComparisonRange;
  rangeB: FeesComparisonRange;
  rows: FeesComparisonRow[];
  totals: {
    rangeAAmount: number;
    rangeBAmount: number;
    difference: number;
  };
};

type Bucket = {
  key: string;
  category: FeesComparisonRow["category"];
  head: string;
  amount: number;
  count: number;
};

function parseYmdDay(raw: string | null, boundary: "start" | "end"): Date {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date range");
  }
  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const date = new Date(`${value}${suffix}`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date range");
  }
  return date;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function canonicalFeeHead(rawName: string): { key: string; head: string } {
  const name = normalizeName(rawName) || "Other Fee";
  const lower = name.toLowerCase();

  if (lower.includes("admission")) return { key: "fee:admission", head: "Admission Fees" };
  if (lower.includes("tuition") || lower.includes("tution")) return { key: "fee:tuition", head: "Tuition Fees" };
  if (lower.includes("mess") || lower.includes("mees")) return { key: "fee:mess", head: "Mess Fees" };
  if (lower.includes("hostel") || lower.includes("boarding")) return { key: "fee:hostel", head: "Hostel Fees" };
  if (lower.includes("transport") || lower.includes("bus") || lower.includes("vehicle")) {
    return { key: "fee:transport", head: "Transport Fees" };
  }

  const display = titleCase(name);
  return { key: `fee:other:${display.toLowerCase()}`, head: `Other Fees - ${display}` };
}

function addToBucket(map: Map<string, Bucket>, input: Omit<Bucket, "amount" | "count">, amount: number) {
  const current =
    map.get(input.key) ??
    {
      key: input.key,
      category: input.category,
      head: input.head,
      amount: 0,
      count: 0,
    };
  current.amount = roundMoney(current.amount + amount);
  current.count += 1;
  map.set(input.key, current);
}

async function aggregateRange(schoolId: string, from: Date, to: Date): Promise<Map<string, Bucket>> {
  const buckets = new Map<string, Bucket>();

  const admissionTxs = await loadAdmissionFeeDayReportTransactions(schoolId, from, to);
  for (const tx of admissionTxs) {
    addToBucket(
      buckets,
      { key: "fee:admission", category: "FEES", head: "Admission Fees" },
      Number(tx.amount) || 0
    );
  }

  const allocations = await prisma.paymentFeeAllocation.findMany({
    where: {
      allocationType: { in: ["PAYMENT", "REFUND"] },
      payment: {
        status: { in: ["SUCCESS", "COMPLETED"] },
        purpose: "FEES",
        createdAt: { gte: from, lte: to },
        student: { schoolId },
      },
    },
    select: {
      allocationType: true,
      allocatedAmount: true,
      headType: true,
      componentName: true,
      extraFeeId: true,
    },
  });

  const extraFeeIds = [
    ...new Set(
      allocations
        .filter((a) => a.headType === "EXTRA_FEE" && a.extraFeeId)
        .map((a) => a.extraFeeId as string)
    ),
  ];
  const extraNameById = new Map<string, string>();
  if (extraFeeIds.length > 0) {
    const extras = await prisma.extraFee.findMany({
      where: { id: { in: extraFeeIds }, schoolId },
      select: { id: true, name: true },
    });
    for (const extra of extras) extraNameById.set(extra.id, extra.name);
  }

  for (const allocation of allocations) {
    const rawName =
      allocation.headType === "EXTRA_FEE"
        ? extraNameById.get(allocation.extraFeeId ?? "") ?? "Other Fee"
        : allocation.componentName ?? "Other Fee";
    const { key, head } = canonicalFeeHead(rawName);
    const sign = allocation.allocationType === "REFUND" ? -1 : 1;
    addToBucket(
      buckets,
      { key, category: "FEES", head },
      sign * (Number(allocation.allocatedAmount) || 0)
    );
  }

  const pettyCashRows = await prisma.pettyCashExpense.groupBy({
    by: ["headOfAccount"],
    where: {
      schoolId,
      expenseDate: { gte: from, lte: to },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  for (const row of pettyCashRows) {
    const headName = titleCase(normalizeName(row.headOfAccount) || "Uncategorised");
    const key = `petty:${headName.toLowerCase()}`;
    const amount = Number(row._sum.amount ?? 0);
    buckets.set(key, {
      key,
      category: "PETTY_CASH",
      head: `Petty Cash - ${headName}`,
      amount: roundMoney(amount),
      count: Number(row._count._all ?? 0),
    });
  }

  return buckets;
}

export async function buildFeesComparisonReport(
  schoolId: string,
  input: {
    rangeAFrom: string | null;
    rangeATo: string | null;
    rangeBFrom: string | null;
    rangeBTo: string | null;
  }
): Promise<FeesComparisonReport> {
  const rangeAFrom = String(input.rangeAFrom ?? "");
  const rangeATo = String(input.rangeATo ?? "");
  const rangeBFrom = String(input.rangeBFrom ?? "");
  const rangeBTo = String(input.rangeBTo ?? "");

  const aFrom = parseYmdDay(rangeAFrom, "start");
  const aTo = parseYmdDay(rangeATo, "end");
  const bFrom = parseYmdDay(rangeBFrom, "start");
  const bTo = parseYmdDay(rangeBTo, "end");

  if (aFrom > aTo || bFrom > bTo) {
    throw new Error("From date cannot be after To date");
  }

  const [rangeABuckets, rangeBBuckets] = await Promise.all([
    aggregateRange(schoolId, aFrom, aTo),
    aggregateRange(schoolId, bFrom, bTo),
  ]);

  const keys = new Set([...rangeABuckets.keys(), ...rangeBBuckets.keys()]);
  const rows: FeesComparisonRow[] = [...keys]
    .map((key) => {
      const a = rangeABuckets.get(key);
      const b = rangeBBuckets.get(key);
      const head = a?.head ?? b?.head ?? key;
      const category = a?.category ?? b?.category ?? "FEES";
      const rangeAAmount = roundMoney(a?.amount ?? 0);
      const rangeBAmount = roundMoney(b?.amount ?? 0);
      return {
        key,
        category,
        head,
        rangeAAmount,
        rangeBAmount,
        difference: roundMoney(rangeBAmount - rangeAAmount),
        rangeACount: a?.count ?? 0,
        rangeBCount: b?.count ?? 0,
      };
    })
    .sort((a, b) => {
      const order = [
        "fee:admission",
        "fee:tuition",
        "fee:mess",
        "fee:hostel",
        "fee:transport",
      ];
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      if (a.category !== b.category) return a.category === "FEES" ? -1 : 1;
      return a.head.localeCompare(b.head);
    });

  const totals = rows.reduce(
    (acc, row) => ({
      rangeAAmount: roundMoney(acc.rangeAAmount + row.rangeAAmount),
      rangeBAmount: roundMoney(acc.rangeBAmount + row.rangeBAmount),
      difference: roundMoney(acc.difference + row.difference),
    }),
    { rangeAAmount: 0, rangeBAmount: 0, difference: 0 }
  );

  return {
    rangeA: { from: rangeAFrom, to: rangeATo },
    rangeB: { from: rangeBFrom, to: rangeBTo },
    rows,
    totals,
  };
}
