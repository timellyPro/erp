export type GroupMode = "day" | "month";

export type ApplicationRow = {
  applicationNo: string;
  applicantName: string;
  classOrGrade: string;
  admissionFee: number;
  paidAtIso: string;
  paymentMode: string | null;
  paymentMethod: string | null;
};

export type Bucket = { period: string; count: number; amount: number };

export type ChannelTotals = { count: number; amount: number };

export type ReportPayload = {
  from: string;
  to: string;
  applications: ApplicationRow[];
  byDay: Bucket[];
  byMonth: Bucket[];
  totals: { count: number; amount: number };
  totalsByChannel?: Partial<{ cash: ChannelTotals; online: ChannelTotals }>;
};

export function defaultDateRange() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: today,
    to: today,
  };
}

export type SchoolMeta = { name: string; logoUrl: string | null };

export async function fetchSchoolMeta(): Promise<SchoolMeta> {
  try {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const data = await res.json();
    return {
      name: data?.school?.name || "School",
      logoUrl: data?.school?.logoUrl || data?.school?.admins?.[0]?.photoUrl || null,
    };
  } catch {
    return { name: "School", logoUrl: null };
  }
}

export function formatReportYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatSummaryPeriod(period: string, groupMode: GroupMode): string {
  if (groupMode === "month" && /^\d{4}-\d{2}$/.test(period)) {
    const d = new Date(`${period}-01T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }
  }
  if (groupMode === "day" && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return formatReportYmd(period);
  }
  return period;
}
