import { canonicalExtraFeeBaseName } from "@/lib/extraFeeInstallments";
import {
  extraFeeAppliesToStudent,
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
} from "@/lib/extraFeeResidencyScope";
import { isPreviousYearFeeHeadName } from "@/lib/feeYearClassification";
import { canonicalizeResidencyType } from "@/lib/residencyDisplay";

export const ACADEMIC_YEAR_MONTHS = 12;

export type ResidencyKind = "Hosteller" | "Day Scholar";

export type CatalogExtraFee = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string | null;
  residencyConversion?: boolean | null;
};

export type PeriodDraft = {
  residencyType: ResidencyKind;
  startedOn: string;
  endedOn: string | null;
  months: number;
  transportKey: string | null;
  transportLabel: string | null;
};

export type TransportOption = {
  key: string;
  label: string;
  annualAmount: number;
  /** Prorated amount for day-scholar months that still need a slab. */
  proratedAmount: number;
};

export type ChargePreview = {
  category: "hostel" | "mess" | "transport";
  label: string;
  months: number;
  annualAmount: number;
  proratedAmount: number;
};

export type PlannedFeeRow = {
  name: string;
  amount: number;
};

export type ConversionPlan = {
  academicYearStartYear: number;
  academicYearLabel: string;
  periods: PeriodDraft[];
  feeRows: PlannedFeeRow[];
  charges: ChargePreview[];
  transportOptions: TransportOption[];
  requiresTransportChoice: boolean;
};

export function residencyKind(value: string | null | undefined): ResidencyKind | null {
  const canonical = canonicalizeResidencyType(value);
  if (canonical === "Hosteller") return "Hosteller";
  if (canonical === "Day Scholar") return "Day Scholar";
  return null;
}

export function residencyPeriodTitle(kind: ResidencyKind): string {
  return kind === "Hosteller" ? "Hostel" : "Day Scholar";
}

export function isTransportFeeName(name: string | null | undefined): boolean {
  return String(name ?? "").toLowerCase().includes("transport");
}

/** Hostel, mess, and transport heads that a conversion replaces for one student. Previous-year dues stay. */
export function isResidencyBoundFeeName(name: string | null | undefined): boolean {
  if (isPreviousYearFeeHeadName(name)) return false;
  return (
    isHostelCategoryExtraFeeName(name) ||
    isMessCategoryExtraFeeName(name) ||
    isTransportFeeName(name)
  );
}

export function residencyConversionStudentIds(
  fees: Array<{ residencyConversion?: boolean | null; targetStudentId?: string | null }>
): Set<string> {
  const ids = new Set<string>();
  for (const fee of fees) {
    if (fee.residencyConversion && fee.targetStudentId) ids.add(fee.targetStudentId);
  }
  return ids;
}

/**
 * Conversion rows always bill that student.
 * Once a student has conversion rows, class/school hostel, mess, and transport are replaced by those rows.
 */
export function includeExtraFeeOnStudentBill(
  fee: {
    name?: string | null;
    residencyScope?: string | null;
    residencyConversion?: boolean | null;
    targetStudentId?: string | null;
  },
  studentResidency: string | null | undefined,
  studentId: string | null | undefined,
  convertedStudentIds: ReadonlySet<string>
): boolean {
  if (fee.residencyConversion) {
    return Boolean(studentId) && fee.targetStudentId === studentId;
  }
  if (studentId && convertedStudentIds.has(studentId) && isResidencyBoundFeeName(fee.name)) {
    return false;
  }
  return extraFeeAppliesToStudent(
    { name: fee.name, residencyScope: fee.residencyScope },
    studentResidency
  );
}

export function kolkataYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function academicYearStartYearFromYmd(ymd: string): number {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  return month >= 6 ? year : year - 1;
}

export function academicYearStartYmd(startYear: number): string {
  return `${startYear}-06-01`;
}

export function academicYearEndYmd(startYear: number): string {
  return `${startYear + 1}-06-01`;
}

export function academicYearLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

/** June = 0 … May = 11. */
export function monthIndexFromYmd(ymd: string): number {
  const month = Number(ymd.slice(5, 7));
  return month >= 6 ? month - 6 : month + 6;
}

export function monthsBetweenYmd(start: string, endExclusive: string, yearStart: number): number {
  const end =
    endExclusive === academicYearEndYmd(yearStart)
      ? ACADEMIC_YEAR_MONTHS
      : monthIndexFromYmd(endExclusive);
  return Math.max(0, end - monthIndexFromYmd(start));
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function transportKeyFromName(name: string): string {
  return canonicalExtraFeeBaseName(name).trim().toLowerCase();
}

function transportLabelFromName(name: string): string {
  const base = canonicalExtraFeeBaseName(name).trim();
  const match = base.match(/transport(?:ation)?\s+fee\s*[-–:]?\s*(.*)$/i);
  const route = (match?.[1] ?? "").trim().replace(/^[-–]+\s*/, "");
  if (!route) return "Transport";
  return route.replace(/\s+/g, " ");
}

function specificity(
  fee: CatalogExtraFee,
  classId: string | null,
  section: string | null
): number {
  if (fee.residencyConversion || fee.targetType === "STUDENT") return 0;
  if (
    fee.targetType === "SECTION" &&
    classId &&
    fee.targetClassId === classId &&
    fee.targetSection === section
  ) {
    return 3;
  }
  if (fee.targetType === "CLASS" && classId && fee.targetClassId === classId) return 2;
  if (fee.targetType === "SCHOOL") return 1;
  return 0;
}

function catalogRows(
  fees: CatalogExtraFee[],
  classId: string | null,
  section: string | null,
  keep: (fee: CatalogExtraFee) => boolean
): CatalogExtraFee[] {
  const ranked = fees
    .map((fee) => ({ fee, rank: specificity(fee, classId, section) }))
    .filter((row) => row.rank > 0 && keep(row.fee));
  const best = ranked.reduce((max, row) => Math.max(max, row.rank), 0);
  if (!best) return [];
  return ranked.filter((row) => row.rank === best).map((row) => row.fee);
}

function omitLegacySplitDuplicates(rows: CatalogExtraFee[]): CatalogExtraFee[] {
  const byBase = new Map<string, CatalogExtraFee[]>();
  for (const row of rows) {
    const base = canonicalExtraFeeBaseName(row.name).toLowerCase();
    const list = byBase.get(base) ?? [];
    list.push(row);
    byBase.set(base, list);
  }
  const dropped = new Set<CatalogExtraFee>();
  for (const group of byBase.values()) {
    const installments = group.filter((row) => /\b(1st|2nd)\b/i.test(row.name) && /install/i.test(row.name));
    const lumps = group.filter((row) => !installments.includes(row));
    const hasFirst = installments.some((row) => /\b1st\b/i.test(row.name));
    const hasSecond = installments.some((row) => /\b2nd\b/i.test(row.name));
    if (hasFirst && hasSecond) {
      for (const lump of lumps) dropped.add(lump);
    } else if (lumps.length > 0 && installments.length > 0) {
      for (const installment of installments) dropped.add(installment);
    }
  }
  return rows.filter((row) => !dropped.has(row));
}

function prorateRows(rows: Array<{ name: string; amount: number }>, months: number): PlannedFeeRow[] {
  if (months <= 0) return [];
  const annual = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  if (annual <= 0) return [];
  const target = roundMoney((annual * months) / ACADEMIC_YEAR_MONTHS);
  if (target <= 0) return [];
  let left = target;
  const out: PlannedFeeRow[] = [];
  rows.forEach((row, index) => {
    const share =
      index === rows.length - 1
        ? left
        : roundMoney(((Number(row.amount) || 0) / annual) * target);
    left = roundMoney(left - share);
    if (share > 0.009) out.push({ name: row.name, amount: share });
  });
  return out;
}

type TransportChoice = { key: string; label: string };

function choiceFromKey(options: TransportOption[], key: string | null | undefined): TransportChoice | null {
  if (!key) return null;
  const found = options.find((option) => option.key === key);
  return found ? { key: found.key, label: found.label } : null;
}

export function buildResidencyConversionPlan(input: {
  academicYearStartYear: number;
  convertedOn: string;
  fromResidency: ResidencyKind;
  toResidency: ResidencyKind;
  classId: string | null;
  section: string | null;
  studentId: string;
  catalog: CatalogExtraFee[];
  existingPeriods: PeriodDraft[];
  transportKey?: string | null;
}): ConversionPlan {
  const year = input.academicYearStartYear;
  const hostelSource = omitLegacySplitDuplicates(
    catalogRows(input.catalog, input.classId, input.section, (fee) =>
      isHostelCategoryExtraFeeName(fee.name) &&
      extraFeeAppliesToStudent({ name: fee.name, residencyScope: fee.residencyScope }, "Hosteller")
    )
  );
  const messSource = omitLegacySplitDuplicates(
    catalogRows(input.catalog, input.classId, input.section, (fee) =>
      isMessCategoryExtraFeeName(fee.name) &&
      extraFeeAppliesToStudent({ name: fee.name, residencyScope: fee.residencyScope }, "Day Scholar")
    )
  );
  const transportSource = omitLegacySplitDuplicates(
    catalogRows(input.catalog, input.classId, input.section, (fee) =>
      isTransportFeeName(fee.name) &&
      extraFeeAppliesToStudent({ name: fee.name, residencyScope: fee.residencyScope }, "Day Scholar")
    )
  );

  const transportGroups = new Map<string, CatalogExtraFee[]>();
  for (const fee of transportSource) {
    const key = transportKeyFromName(fee.name);
    const list = transportGroups.get(key) ?? [];
    list.push(fee);
    transportGroups.set(key, list);
  }

  const studentTransportKeys = new Set<string>();
  for (const fee of input.catalog) {
    if (fee.residencyConversion) continue;
    if (fee.targetType !== "STUDENT" || fee.targetStudentId !== input.studentId) continue;
    if (!isTransportFeeName(fee.name)) continue;
    studentTransportKeys.add(transportKeyFromName(fee.name));
  }
  const detected =
    studentTransportKeys.size === 1
      ? choiceFromKey(
          [...transportGroups.entries()].map(([key, rows]) => ({
            key,
            label: transportLabelFromName(rows[0]?.name ?? ""),
            annualAmount: 0,
            proratedAmount: 0,
          })),
          [...studentTransportKeys][0]
        )
      : null;

  const optionsPreview: TransportOption[] = [...transportGroups.entries()].map(([key, rows]) => ({
    key,
    label: transportLabelFromName(rows[0]?.name ?? ""),
    annualAmount: roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
    proratedAmount: 0,
  }));
  const sole = optionsPreview.length === 1 ? { key: optionsPreview[0]!.key, label: optionsPreview[0]!.label } : null;
  const explicit = choiceFromKey(optionsPreview, input.transportKey);
  const pastChoice = detected ?? sole ?? explicit;
  const nextChoice = explicit ?? detected ?? sole;

  const periods = planPeriods({
    year,
    convertedOn: input.convertedOn,
    fromResidency: input.fromResidency,
    toResidency: input.toResidency,
    existing: input.existingPeriods,
    pastChoice,
    nextChoice: input.toResidency === "Day Scholar" ? nextChoice : null,
  });

  const unresolvedDayScholarMonths = periods
    .filter((period) => period.residencyType === "Day Scholar" && period.months > 0 && !period.transportKey)
    .reduce((sum, period) => sum + period.months, 0);
  const requiresTransportChoice = unresolvedDayScholarMonths > 0 && optionsPreview.length > 0;

  const hostelMonths = periods
    .filter((period) => period.residencyType === "Hosteller")
    .reduce((sum, period) => sum + period.months, 0);
  const messMonths = periods
    .filter((period) => period.residencyType === "Day Scholar")
    .reduce((sum, period) => sum + period.months, 0);

  const feeRows: PlannedFeeRow[] = [
    ...prorateRows(hostelSource, hostelMonths),
    ...prorateRows(messSource, messMonths),
  ];
  const charges: ChargePreview[] = [];
  const hostelAnnual = roundMoney(hostelSource.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  const messAnnual = roundMoney(messSource.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  if (hostelMonths > 0 && hostelAnnual > 0) {
    charges.push({
      category: "hostel",
      label: "Hostel Fee",
      months: hostelMonths,
      annualAmount: hostelAnnual,
      proratedAmount: roundMoney(feeRows.filter((row) => isHostelCategoryExtraFeeName(row.name)).reduce((s, r) => s + r.amount, 0)),
    });
  }
  if (messMonths > 0 && messAnnual > 0) {
    charges.push({
      category: "mess",
      label: "Mess Fee",
      months: messMonths,
      annualAmount: messAnnual,
      proratedAmount: roundMoney(feeRows.filter((row) => isMessCategoryExtraFeeName(row.name)).reduce((s, r) => s + r.amount, 0)),
    });
  }

  const transportOptions = optionsPreview.map((option) => {
    const months = periods
      .filter((period) => period.residencyType === "Day Scholar" && period.transportKey === option.key)
      .reduce((sum, period) => sum + period.months, 0);
    const rows = transportGroups.get(option.key) ?? [];
    const created = prorateRows(rows, months);
    feeRows.push(...created);
    if (months > 0) {
      charges.push({
        category: "transport",
        label: `Transport (${option.label})`,
        months,
        annualAmount: option.annualAmount,
        proratedAmount: roundMoney(created.reduce((sum, row) => sum + row.amount, 0)),
      });
    }
    return {
      ...option,
      proratedAmount: requiresTransportChoice
        ? roundMoney((option.annualAmount * unresolvedDayScholarMonths) / ACADEMIC_YEAR_MONTHS)
        : roundMoney(created.reduce((sum, row) => sum + row.amount, 0)),
    };
  });

  return {
    academicYearStartYear: year,
    academicYearLabel: academicYearLabel(year),
    periods,
    feeRows,
    charges,
    transportOptions,
    requiresTransportChoice,
  };
}

function planPeriods(input: {
  year: number;
  convertedOn: string;
  fromResidency: ResidencyKind;
  toResidency: ResidencyKind;
  existing: PeriodDraft[];
  pastChoice: TransportChoice | null;
  nextChoice: TransportChoice | null;
}): PeriodDraft[] {
  const yearStart = academicYearStartYmd(input.year);
  const yearEnd = academicYearEndYmd(input.year);
  const convertedOn =
    input.convertedOn < yearStart ? yearStart : input.convertedOn > yearEnd ? yearEnd : input.convertedOn;

  const fill = (period: PeriodDraft, choice: TransportChoice | null, onlyIfMissing: boolean): PeriodDraft => {
    if (period.residencyType !== "Day Scholar" || !choice) return period;
    if (onlyIfMissing && period.transportKey) return period;
    if (period.transportKey) return period;
    return { ...period, transportKey: choice.key, transportLabel: choice.label };
  };

  if (input.existing.length === 0) {
    const before = monthsBetweenYmd(yearStart, convertedOn, input.year);
    const after = ACADEMIC_YEAR_MONTHS - before;
    const periods: PeriodDraft[] = [];
    if (before > 0) {
      periods.push(
        fill(
          {
            residencyType: input.fromResidency,
            startedOn: yearStart,
            endedOn: convertedOn,
            months: before,
            transportKey: null,
            transportLabel: null,
          },
          input.pastChoice,
          true
        )
      );
    }
    if (after > 0) {
      periods.push(
        fill(
          {
            residencyType: input.toResidency,
            startedOn: convertedOn,
            endedOn: null,
            months: after,
            transportKey: null,
            transportLabel: null,
          },
          input.nextChoice,
          true
        )
      );
    }
    return periods;
  }

  const sorted = [...input.existing].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const openIndex = sorted.findIndex((period) => !period.endedOn);
  const next = sorted.map((period) => ({ ...period }));
  if (openIndex >= 0) {
    const open = next[openIndex]!;
    const months = monthsBetweenYmd(open.startedOn, convertedOn, input.year);
    next[openIndex] = fill(
      { ...open, endedOn: convertedOn, months },
      input.pastChoice,
      true
    );
  }
  const after = ACADEMIC_YEAR_MONTHS - monthIndexFromYmd(convertedOn);
  if (after > 0) {
    next.push(
      fill(
        {
          residencyType: input.toResidency,
          startedOn: convertedOn,
          endedOn: null,
          months: after,
          transportKey: null,
          transportLabel: null,
        },
        input.nextChoice,
        true
      )
    );
  }
  return next.filter((period) => period.months > 0);
}

export function residencyConversionCreditByHead(
  heads: Array<{ key: string; snapshotDue: number; paid: number; residencyConversion: boolean }>,
  extraSurplus = 0
): { creditByKey: Map<string, number>; creditApplied: number } {
  const conversionHeads = heads.filter((head) => head.residencyConversion);
  let surplus = roundMoney(extraSurplus);
  for (const head of conversionHeads) {
    surplus = roundMoney(surplus + Math.max(0, head.paid - head.snapshotDue));
  }
  const creditByKey = new Map<string, number>();
  if (surplus <= 0.009 || conversionHeads.length === 0) {
    return { creditByKey, creditApplied: 0 };
  }
  const rooms = conversionHeads
    .map((head) => ({
      key: head.key,
      room: roundMoney(Math.max(0, head.snapshotDue - head.paid)),
    }))
    .filter((head) => head.room > 0.009)
    .sort((a, b) => b.room - a.room);
  let applied = 0;
  for (const room of rooms) {
    if (surplus <= 0.009) break;
    const take = roundMoney(Math.min(surplus, room.room));
    if (take <= 0) continue;
    creditByKey.set(room.key, take);
    applied = roundMoney(applied + take);
    surplus = roundMoney(surplus - take);
  }
  return { creditByKey, creditApplied: applied };
}

/** Due-only credit for a student who already has conversion fee rows. Does not rewrite payments. */
export function conversionDueCredit(
  heads: Array<{ key: string; snapshotDue: number; residencyConversion?: boolean; extraFeeId?: string }>,
  netPaidByHead: Map<string, number>,
  nameByExtraId: Map<string, string>
): Map<string, number> {
  if (!heads.some((head) => head.residencyConversion)) return new Map();
  const headIds = new Set(heads.flatMap((head) => (head.extraFeeId ? [head.extraFeeId] : [])));
  let orphanResidencyPaid = 0;
  for (const [key, amount] of netPaidByHead) {
    if (!key.startsWith("EXTRA:")) continue;
    const id = key.slice("EXTRA:".length);
    if (headIds.has(id)) continue;
    const name = nameByExtraId.get(id);
    if (name && isResidencyBoundFeeName(name)) orphanResidencyPaid += amount;
  }
  return residencyConversionCreditByHead(
    heads.map((head) => ({
      key: head.key,
      snapshotDue: head.snapshotDue,
      paid: netPaidByHead.get(head.key) ?? 0,
      residencyConversion: Boolean(head.residencyConversion),
    })),
    orphanResidencyPaid
  ).creditByKey;
}
