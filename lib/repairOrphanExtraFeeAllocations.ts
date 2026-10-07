import {
  canonicalExtraFeeBaseName,
  installmentIndexFromName,
} from "@/lib/extraFeeInstallments";
import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
  isStudentHosteller,
} from "@/lib/extraFeeResidencyScope";

type LiveExtraFee = {
  id: string;
  name: string;
  targetType: string;
  targetStudentId: string | null;
};

type OrphanAllocation = {
  id: string;
  extraFeeId: string | null;
  componentName: string | null;
  allocatedAmount: number;
  studentId: string;
};

/** Match a deleted/orphan fee name to a live extra-fee row (school → student scope). */
export function matchLiveExtraFeeIdForOrphanName(
  orphanName: string,
  liveFees: LiveExtraFee[],
  studentId: string
): string | null {
  const trimmed = orphanName.trim();
  if (!trimmed) return null;

  const orphanBase = canonicalExtraFeeBaseName(trimmed).toLowerCase();
  if (!orphanBase) return null;
  const orphanIdx = installmentIndexFromName(trimmed);

  const candidates = liveFees
    .filter((f) => canonicalExtraFeeBaseName(f.name).toLowerCase() === orphanBase)
    .sort((a, b) => {
      const scopeScore = (f: LiveExtraFee) => {
        if (f.targetType === "STUDENT" && f.targetStudentId === studentId) return 0;
        if (f.targetType === "SCHOOL") return 1;
        return 2;
      };
      return scopeScore(a) - scopeScore(b);
    });

  if (candidates.length === 0) return null;

  if (orphanIdx) {
    const exact = candidates.find((f) => installmentIndexFromName(f.name) === orphanIdx);
    if (exact) return exact.id;
  }

  const first = candidates.find((f) => installmentIndexFromName(f.name) === 1);
  if (first) return first.id;

  return candidates[0]!.id;
}

export function resolveOrphanAllocationFeeName(
  alloc: Pick<OrphanAllocation, "componentName" | "allocatedAmount">,
  options: {
    hosteller: boolean;
    hostelFees: Array<{ name: string; amount: number }>;
    messFees: Array<{ name: string; amount: number }>;
  }
): string | null {
  const snap = alloc.componentName?.trim();
  if (snap) return snap;

  const amount = Number(alloc.allocatedAmount) || 0;
  if (amount <= 0) return null;

  const pool = options.hosteller ? options.hostelFees : options.messFees;
  if (pool.length === 0) return null;

  const exact = pool.find((f) => Math.abs(Number(f.amount) - amount) < 0.02);
  if (exact) return exact.name.trim();

  if (options.hosteller && options.hostelFees.length > 0) {
    return options.hostelFees[0]!.name.trim();
  }
  if (!options.hosteller && options.messFees.length > 0) {
    return options.messFees[0]!.name.trim();
  }
  return null;
}

type RepairDb = Pick<
  typeof import("@/lib/db").default,
  "extraFee" | "paymentFeeAllocation" | "student"
>;

export async function repairOrphanExtraFeeAllocations(
  db: RepairDb,
  schoolId: string,
  options?: { studentId?: string }
): Promise<{ reassigned: number; namesBackfilled: number }> {
  let reassigned = 0;
  let namesBackfilled = 0;

  const orphanAllocations = (await db.paymentFeeAllocation.findMany({
    where: {
      headType: "EXTRA_FEE",
      extraFeeId: { not: null },
      payment: {
        student: {
          schoolId,
          ...(options?.studentId ? { id: options.studentId } : {}),
        },
      },
    },
    select: {
      id: true,
      extraFeeId: true,
      componentName: true,
      allocatedAmount: true,
      studentId: true,
    },
  })) as OrphanAllocation[];

  if (orphanAllocations.length === 0) {
    return { reassigned, namesBackfilled };
  }

  const referencedIds = Array.from(
    new Set(orphanAllocations.map((a) => a.extraFeeId).filter((id): id is string => Boolean(id)))
  );
  const existing = referencedIds.length
    ? await db.extraFee.findMany({
        where: { id: { in: referencedIds } },
        select: { id: true },
      })
    : [];
  const existingIds = new Set(existing.map((e) => e.id));

  const broken = orphanAllocations.filter((a) => a.extraFeeId && !existingIds.has(a.extraFeeId));
  if (broken.length === 0) {
    return { reassigned, namesBackfilled };
  }

  const studentIds = [...new Set(broken.map((a) => a.studentId))];
  const [liveFees, students, schoolScopedFees] = await Promise.all([
    db.extraFee.findMany({
      where: {
        schoolId,
        OR: [
          { targetType: "SCHOOL" },
          { targetType: "STUDENT", targetStudentId: { in: studentIds } },
        ],
      },
      select: {
        id: true,
        name: true,
        targetType: true,
        targetStudentId: true,
      },
    }),
    db.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, residencyType: true },
    }),
    db.extraFee.findMany({
      where: { schoolId, targetType: "SCHOOL" },
      select: { id: true, name: true, amount: true },
    }),
  ]);

  const residencyByStudentId = new Map(students.map((s) => [s.id, s.residencyType]));
  const hostelFees = schoolScopedFees.filter((f) => isHostelCategoryExtraFeeName(f.name));
  const messFees = schoolScopedFees.filter((f) => isMessCategoryExtraFeeName(f.name));

  const nameBackfillByName = new Map<string, string[]>();
  const reassignByTarget = new Map<string, { liveId: string; componentName: string; ids: string[] }>();

  for (const alloc of broken) {
    const hosteller = isStudentHosteller(residencyByStudentId.get(alloc.studentId));
    const resolvedName = resolveOrphanAllocationFeeName(alloc, {
      hosteller,
      hostelFees,
      messFees,
    });
    if (!resolvedName) continue;

    if (!alloc.componentName?.trim()) {
      const ids = nameBackfillByName.get(resolvedName) ?? [];
      ids.push(alloc.id);
      nameBackfillByName.set(resolvedName, ids);
    }

    const liveId = matchLiveExtraFeeIdForOrphanName(resolvedName, liveFees, alloc.studentId);
    if (!liveId || liveId === alloc.extraFeeId) continue;

    const componentName = alloc.componentName?.trim() || resolvedName;
    const key = `${liveId}::${componentName}`;
    const bucket = reassignByTarget.get(key) ?? { liveId, componentName, ids: [] };
    bucket.ids.push(alloc.id);
    reassignByTarget.set(key, bucket);
  }

  for (const [name, ids] of nameBackfillByName) {
    const result = await db.paymentFeeAllocation.updateMany({
      where: { id: { in: ids } },
      data: { componentName: name },
    });
    namesBackfilled += result.count;
  }

  for (const { liveId, componentName, ids } of reassignByTarget.values()) {
    const result = await db.paymentFeeAllocation.updateMany({
      where: { id: { in: ids } },
      data: { extraFeeId: liveId, componentName },
    });
    reassigned += result.count;
  }

  return { reassigned, namesBackfilled };
}
