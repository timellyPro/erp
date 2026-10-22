import type { Prisma } from "@prisma/client";
import { tenantDb as prismaClient } from "@/lib/db/tenantContext";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/fees/feePaymentStatuses";
import { canonicalExtraFeeBaseName } from "@/lib/fees/extraFeeInstallments";
import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
} from "@/lib/fees/extraFeeResidencyScope";
import {
  academicYearStartYearFromYmd,
  buildResidencyConversionPlan,
  isResidencyBoundFeeName,
  isTransportFeeName,
  kolkataYmd,
  normalizeYearMonths,
  residencyKind,
  type CatalogExtraFee,
  type ChargePreview,
  type ConversionPlan,
  type PeriodDraft,
  type ResidencyKind,
} from "@/lib/fees/residencyConversion";

type AppPrisma = typeof prismaClient;
type Db = Pick<AppPrisma, "extraFee" | "studentResidencyPeriod" | "paymentFeeAllocation" | "schoolSettings">;

function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function dateToYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const catalogSelect = {
  id: true,
  name: true,
  amount: true,
  targetType: true,
  targetClassId: true,
  targetSection: true,
  targetStudentId: true,
  residencyScope: true,
  residencyConversion: true,
} as const;

export type ResidencyConversionPreview = ConversionPlan & {
  fromResidency: ResidencyKind;
  toResidency: ResidencyKind;
  charges: Array<ChargePreview & { alreadyPaid: number }>;
  paymentsUnchanged: true;
};

async function loadCatalog(
  db: Db,
  schoolId: string,
  studentId: string,
  classId: string | null,
  section: string | null
): Promise<CatalogExtraFee[]> {
  const or: Prisma.ExtraFeeWhereInput[] = [
    { targetType: "SCHOOL" },
    { targetType: "STUDENT", targetStudentId: studentId },
  ];
  if (classId) or.push({ targetType: "CLASS", targetClassId: classId });
  if (classId && section) {
    or.push({ targetType: "SECTION", targetClassId: classId, targetSection: section });
  }
  const rows = await db.extraFee.findMany({
    where: { schoolId, residencyConversion: false, OR: or },
    select: catalogSelect,
  });
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount) || 0,
  }));
}

async function loadPeriods(db: Db, studentId: string, year: number): Promise<PeriodDraft[]> {
  const rows = await db.studentResidencyPeriod.findMany({
    where: { studentId, academicYearStartYear: year },
    orderBy: { startedOn: "asc" },
  });
  return rows.flatMap((row) => {
    const kind = residencyKind(row.residencyType);
    if (!kind) return [];
    return [
      {
        residencyType: kind,
        startedOn: dateToYmd(row.startedOn),
        endedOn: row.endedOn ? dateToYmd(row.endedOn) : null,
        months: row.months,
        transportKey: row.transportKey,
        transportLabel: row.transportLabel,
      },
    ];
  });
}

async function loadPaidByName(
  db: Db,
  studentId: string
): Promise<Array<{ name: string; net: number }>> {
  const allocations = await db.paymentFeeAllocation.findMany({
    where: {
      studentId,
      headType: "EXTRA_FEE",
      payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
    },
    select: {
      extraFeeId: true,
      componentName: true,
      allocatedAmount: true,
      allocationType: true,
    },
  });
  const ids = [...new Set(allocations.map((row) => row.extraFeeId).filter((id): id is string => Boolean(id)))];
  const fees = ids.length
    ? await db.extraFee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(fees.map((fee) => [fee.id, fee.name]));
  const totals = new Map<string, number>();
  for (const row of allocations) {
    const name = (row.extraFeeId && nameById.get(row.extraFeeId)) || row.componentName || "";
    if (!name || !isResidencyBoundFeeName(name)) continue;
    const sign = row.allocationType === "REFUND" ? -1 : 1;
    totals.set(name, (totals.get(name) ?? 0) + sign * (Number(row.allocatedAmount) || 0));
  }
  return [...totals.entries()].map(([name, net]) => ({ name, net }));
}

function attachPaid(
  charges: ChargePreview[],
  paid: Array<{ name: string; net: number }>
): Array<ChargePreview & { alreadyPaid: number }> {
  const hostel = paid
    .filter((row) => isHostelCategoryExtraFeeName(row.name))
    .reduce((sum, row) => sum + row.net, 0);
    const mess = paid
      .filter((row) => isMessCategoryExtraFeeName(row.name))
      .reduce((sum, row) => sum + row.net, 0);
  const transportPaid = new Map<string, number>();
  for (const row of paid) {
    if (!isTransportFeeName(row.name)) continue;
    const key = canonicalExtraFeeBaseName(row.name).trim().toLowerCase();
    transportPaid.set(key, (transportPaid.get(key) ?? 0) + row.net);
  }
  return charges.map((charge) => {
    if (charge.category === "hostel") return { ...charge, alreadyPaid: roundPaid(hostel) };
    if (charge.category === "mess") return { ...charge, alreadyPaid: roundPaid(mess) };
    const key = charge.label.replace(/^Transport \(/, "").replace(/\)$/, "").trim().toLowerCase();
    let amount = 0;
    for (const [paidKey, net] of transportPaid) {
      if (paidKey.includes(key) || key.includes(paidKey)) amount += net;
    }
    return { ...charge, alreadyPaid: roundPaid(amount) };
  });
}

function roundPaid(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function previewStudentResidencyConversion(
  db: Db,
  input: {
    schoolId: string;
    studentId: string;
    classId: string | null;
    section: string | null;
    fromResidency: ResidencyKind;
    toResidency: ResidencyKind;
    transportKey?: string | null;
    convertedOn?: string;
  }
): Promise<ResidencyConversionPreview> {
  const convertedOn = input.convertedOn ?? kolkataYmd();
  const year = academicYearStartYearFromYmd(convertedOn);
  const [catalog, existingPeriods, paid, settings] = await Promise.all([
    loadCatalog(db, input.schoolId, input.studentId, input.classId, input.section),
    loadPeriods(db, input.studentId, year),
    loadPaidByName(db, input.studentId),
    db.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { residencyYearMonths: true } }),
  ]);
  const plan = buildResidencyConversionPlan({
    academicYearStartYear: year,
    convertedOn,
    fromResidency: input.fromResidency,
    toResidency: input.toResidency,
    classId: input.classId,
    section: input.section,
    studentId: input.studentId,
    catalog,
    existingPeriods,
    transportKey: input.transportKey,
    yearMonths: normalizeYearMonths(settings?.residencyYearMonths),
  });
  return {
    ...plan,
    fromResidency: input.fromResidency,
    toResidency: input.toResidency,
    charges: attachPaid(plan.charges, paid),
    paymentsUnchanged: true,
  };
}

/** The transaction client handed to {@link applyStudentResidencyConversion}'s `afterWrite` hook. */
export type ConversionTx = Parameters<Parameters<AppPrisma["$transaction"]>[0]>[0];

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function applyStudentResidencyConversion(
  db: AppPrisma,
  input: {
    schoolId: string;
    studentId: string;
    classId: string | null;
    section: string | null;
    fromResidency: ResidencyKind;
    toResidency: ResidencyKind;
    transportKey?: string | null;
    /** YYYY-MM-DD the student actually changed type; defaults to today (Asia/Kolkata). */
    convertedOn?: string;
  },
  hooks?: {
    /**
     * Runs inside the same transaction, after the fee rows, periods and residency type are
     * written. The route recalculates the student's stored fee here, so a conversion can never
     * commit with a stale total (before, that ran after the commit and a failure left it stale).
     */
    afterWrite?: (tx: ConversionTx) => Promise<void>;
  }
): Promise<ResidencyConversionPreview> {
  const preview = await previewStudentResidencyConversion(db, input);
  if (preview.requiresTransportChoice) {
    const error = new Error("Choose the transport kilometre slab for this student.");
    (error as Error & { code?: string; preview?: ResidencyConversionPreview }).code =
      "TRANSPORT_REQUIRED";
    (error as Error & { preview?: ResidencyConversionPreview }).preview = preview;
    throw error;
  }
  if (input.transportKey && !preview.transportOptions.some((option) => option.key === input.transportKey)) {
    throw new Error("That transport slab is not set up for this student's class.");
  }

  const year = preview.academicYearStartYear;
  await db.$transaction(async (tx) => {
    // Update the student's conversion rows IN PLACE (matched by name) instead of deleting and
    // recreating them. Payments are linked to a fee row by id, so recreating a row stranded every
    // payment made against the old one ("orphan allocations") and relied on a display-time credit
    // to hide it.
    const existing = await tx.extraFee.findMany({
      where: {
        schoolId: input.schoolId,
        targetType: "STUDENT",
        targetStudentId: input.studentId,
        residencyConversion: true,
      },
      select: { id: true, name: true, amount: true },
    });

    const paidById = new Map<string, number>();
    if (existing.length > 0) {
      const allocations = await tx.paymentFeeAllocation.findMany({
        where: {
          extraFeeId: { in: existing.map((row) => row.id) },
          headType: "EXTRA_FEE",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { extraFeeId: true, allocationType: true, allocatedAmount: true },
      });
      for (const a of allocations) {
        if (!a.extraFeeId) continue;
        const sign = a.allocationType === "REFUND" ? -1 : 1;
        paidById.set(a.extraFeeId, (paidById.get(a.extraFeeId) ?? 0) + sign * (Number(a.allocatedAmount) || 0));
      }
    }

    const nameKey = (name: string) => name.trim().toLowerCase();
    const unmatched = new Map(existing.map((row) => [row.id, row]));
    const byName = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      if (!byName.has(nameKey(row.name))) byName.set(nameKey(row.name), row);
    }

    const toCreate: typeof preview.feeRows = [];
    for (const planned of preview.feeRows) {
      const match = byName.get(nameKey(planned.name));
      if (match && unmatched.has(match.id)) {
        unmatched.delete(match.id);
        if (Math.abs(match.amount - planned.amount) > 0.001) {
          await tx.extraFee.update({ where: { id: match.id }, data: { amount: planned.amount } });
        }
      } else {
        toCreate.push(planned);
      }
    }

    // A row the new plan no longer includes. With payments linked to it, keep it but bill only
    // what was paid (nothing more is due, and the payments stay attached); otherwise remove it.
    for (const row of unmatched.values()) {
      const netPaid = roundMoney(paidById.get(row.id) ?? 0);
      if (netPaid > 0.009) {
        if (Math.abs(row.amount - netPaid) > 0.001) {
          await tx.extraFee.update({ where: { id: row.id }, data: { amount: netPaid } });
        }
      } else {
        await tx.extraFee.delete({ where: { id: row.id } });
      }
    }

    if (toCreate.length > 0) {
      await tx.extraFee.createMany({
        data: toCreate.map((row) => ({
          schoolId: input.schoolId,
          name: row.name,
          amount: row.amount,
          targetType: "STUDENT",
          targetStudentId: input.studentId,
          residencyScope: "ALL",
          residencyConversion: true,
          splitIntoTwoInstallments: false,
        })),
      });
    }

    await tx.studentResidencyPeriod.deleteMany({
      where: { studentId: input.studentId, academicYearStartYear: year },
    });
    if (preview.periods.length > 0) {
      await tx.studentResidencyPeriod.createMany({
        data: preview.periods.map((period) => ({
          studentId: input.studentId,
          schoolId: input.schoolId,
          academicYearStartYear: year,
          residencyType: period.residencyType,
          startedOn: ymdToDate(period.startedOn),
          endedOn: period.endedOn ? ymdToDate(period.endedOn) : null,
          months: period.months,
          transportKey: period.transportKey,
          transportLabel: period.transportLabel,
        })),
      });
    }
    await tx.student.update({
      where: { id: input.studentId },
      data: { residencyType: input.toResidency },
    });

    await hooks?.afterWrite?.(tx);
  });

  return preview;
}
