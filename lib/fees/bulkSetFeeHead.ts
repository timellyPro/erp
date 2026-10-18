import { tenantDb as prisma } from "@/lib/db/tenantContext";
import { applyStudentFeeDelta } from "@/lib/fees/applyStoredFeeDelta";
import { recordFeeAudit, type FeeAuditActor } from "@/lib/fees/feeAudit";
import {
  createExtraFeeRows,
  patchExtraFeeWithInstallmentSupport,
} from "@/lib/fees/extraFeeInstallmentDb";
import { baseNameFromInstallmentFee } from "@/lib/fees/extraFeeInstallments";
import {
  defaultSplitIntoTwoInstallmentsForFeeName,
  extraFeeAppliesToStudent,
  suggestedResidencyScopeForExtraFeeName,
} from "@/lib/fees/extraFeeResidencyScope";
import { sumExtraFeesForStudent, type ExtraFeeRow } from "@/lib/fees/studentTuitionFromStructure";
import { invalidateSchoolFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { roundRupee } from "@/lib/formatRupee";

/**
 * Bulk "set a fee head's amount" for chosen students (this year's records only).
 *
 * A student-specific fee row (targetType STUDENT) is created or updated per student, the stored fee moves
 * by the same difference (so any existing drift is left exactly as it was), every student gets an audit
 * entry, and the run is saved as one FeeBulkEdit so it can be undone as a whole.
 *
 * It never edits a school, class or section fee: if one with this name already applies to a student, that
 * student is skipped (setting a student fee as well would charge the head twice).
 */
export const BULK_MAX_STUDENTS = 500;

export type BulkPlanAction = "CREATE" | "UPDATE" | "SKIP";

export type BulkPlanItem = {
  studentId: string;
  admissionNumber: string;
  name: string | null;
  className: string;
  residencyType: string | null;
  action: BulkPlanAction;
  /** Why a student is skipped. */
  reason?: string;
  currentAmount: number;
  newAmount: number;
  delta: number;
  paidOnHead: number;
};

export type BulkPlan = {
  headName: string;
  amount: number;
  items: BulkPlanItem[];
  willChange: number;
  skipped: number;
  totalDelta: number;
};

type HeadRow = ExtraFeeRow & {
  id: string;
  schoolId: string;
  name: string;
  splitIntoTwoInstallments: boolean;
};

function normName(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateBulkInput(headName: string, amount: number, studentIds: string[]): string | null {
  if (!headName.trim()) return "Choose a fee head name.";
  if (headName.trim().length > 100) return "Fee head name is too long.";
  if (!Number.isFinite(amount) || amount <= 0) return "Amount must be greater than zero.";
  if (amount > 10_000_000) return "Amount is too large.";
  if (studentIds.length === 0) return "Select at least one student.";
  if (studentIds.length > BULK_MAX_STUDENTS) return `Select at most ${BULK_MAX_STUDENTS} students at a time.`;
  return null;
}

export async function planBulkSetFeeHead(
  schoolId: string,
  input: { headName: string; amount: number; studentIds: string[] }
): Promise<BulkPlan> {
  const headName = input.headName.trim();
  const amount = roundRupee(input.amount);
  const ids = [...new Set(input.studentIds.map((s) => s.trim()).filter(Boolean))];
  const headBase = normName(baseNameFromInstallmentFee(headName));

  const [students, allExtras] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, id: { in: ids } },
      select: {
        id: true,
        admissionNumber: true,
        residencyType: true,
        classId: true,
        class: { select: { name: true, section: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.extraFee.findMany({
      where: { schoolId },
      select: {
        id: true,
        schoolId: true,
        name: true,
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
        residencyScope: true,
        residencyConversion: true,
        splitIntoTwoInstallments: true,
      },
    }),
  ]);
  const headRows = allExtras.filter((e) => normName(baseNameFromInstallmentFee(e.name)) === headBase) as HeadRow[];
  const suggestedScope = suggestedResidencyScopeForExtraFeeName(headName);

  const ownRowIds = headRows.filter((r) => r.targetType === "STUDENT" && ids.includes(r.targetStudentId ?? "")).map((r) => r.id);
  const paidRows =
    ownRowIds.length > 0
      ? await prisma.paymentFeeAllocation.groupBy({
          by: ["extraFeeId", "allocationType"],
          where: { extraFeeId: { in: ownRowIds }, payment: { status: "SUCCESS" } },
          _sum: { allocatedAmount: true },
        })
      : [];
  const paidByRow = new Map<string, number>();
  for (const p of paidRows) {
    if (!p.extraFeeId) continue;
    const sign = p.allocationType === "REFUND" ? -1 : 1;
    paidByRow.set(p.extraFeeId, (paidByRow.get(p.extraFeeId) ?? 0) + sign * (p._sum.allocatedAmount ?? 0));
  }

  const found = new Set(students.map((s) => s.id));
  const items: BulkPlanItem[] = ids
    .filter((id) => !found.has(id))
    .map((id) => ({
      studentId: id,
      admissionNumber: "-",
      name: null,
      className: "",
      residencyType: null,
      action: "SKIP" as const,
      reason: "Student not found in this school",
      currentAmount: 0,
      newAmount: 0,
      delta: 0,
      paidOnHead: 0,
    }));

  for (const s of students) {
    const ctx = { classId: s.classId, section: s.class?.section ?? null, studentId: s.id, residencyType: s.residencyType };
    const base = {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      name: s.user?.name ?? null,
      className: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "",
      residencyType: s.residencyType,
    };
    const skip = (reason: string, current = 0, paid = 0): BulkPlanItem => ({
      ...base,
      action: "SKIP",
      reason,
      currentAmount: current,
      newAmount: current,
      delta: 0,
      paidOnHead: paid,
    });

    const own = headRows.filter((r) => r.targetType === "STUDENT" && r.targetStudentId === s.id);
    const broaderApplies = headRows.some(
      (r) => r.targetType !== "STUDENT" && sumExtraFeesForStudent([r], ctx) > 0
    );
    const current = roundRupee(sumExtraFeesForStudent(own, ctx));
    const paid = roundRupee(own.reduce((sum, r) => sum + (paidByRow.get(r.id) ?? 0), 0));

    if (broaderApplies) {
      items.push(skip("A school, class or section fee with this name already applies. Edit that fee instead.", current, paid));
      continue;
    }
    if (!extraFeeAppliesToStudent({ name: headName, residencyScope: suggestedScope }, s.residencyType)) {
      items.push(skip(`This fee does not apply to a ${s.residencyType ?? "student"} under the hostel/mess rules.`, current, paid));
      continue;
    }
    const distinctBases = new Set(own.map((r) => normName(baseNameFromInstallmentFee(r.name))));
    const ownIsOneFee =
      own.length === 1 ||
      (own.length === 2 && distinctBases.size === 1 && own.every((r) => /installment/i.test(r.name)));
    if (own.length > 0 && !ownIsOneFee) {
      items.push(skip("This student has more than one fee with this name. Fix it on the student first.", current, paid));
      continue;
    }
    if (own.length > 0 && current === amount) {
      items.push(skip("Already set to this amount.", current, paid));
      continue;
    }
    if (amount < paid) {
      items.push(skip(`Already paid ${paid} on this fee, which is more than ${amount}.`, current, paid));
      continue;
    }
    items.push({
      ...base,
      action: own.length > 0 ? "UPDATE" : "CREATE",
      currentAmount: current,
      newAmount: amount,
      delta: roundRupee(amount - current),
      paidOnHead: paid,
    });
  }

  const changing = items.filter((i) => i.action !== "SKIP");
  items.sort((a, b) => (a.action === "SKIP" ? 1 : 0) - (b.action === "SKIP" ? 1 : 0) || a.admissionNumber.localeCompare(b.admissionNumber));
  return {
    headName,
    amount,
    items,
    willChange: changing.length,
    skipped: items.length - changing.length,
    totalDelta: roundRupee(changing.reduce((s, i) => s + i.delta, 0)),
  };
}

type StudentChange = {
  studentId: string;
  action: "CREATE" | "UPDATE";
  createdIds: string[];
  updated: Array<{ id: string; previousAmount: number }>;
  previousTotal: number;
  delta: number;
};

/**
 * Applies the plan. Re-plans first and refuses if the number of students it would change differs from what
 * the admin confirmed on the preview, so a fee edited in between cannot be overwritten unseen.
 * Must run inside runInTenantScope (one transaction: all students change or none do).
 */
export async function applyBulkSetFeeHead(
  schoolId: string,
  input: { headName: string; amount: number; studentIds: string[]; confirmCount: number; actor: FeeAuditActor }
): Promise<{ batchId: string; changed: number; skipped: number; totalDelta: number }> {
  const plan = await planBulkSetFeeHead(schoolId, input);
  if (plan.willChange !== input.confirmCount) {
    throw new BulkEditConflictError(
      `The preview said ${input.confirmCount} students would change, but now ${plan.willChange} would. Preview again.`
    );
  }
  const todo = plan.items.filter((i) => i.action !== "SKIP");
  if (todo.length === 0) throw new BulkEditConflictError("Nothing to change.");

  const headName = plan.headName;
  const suggestedScope = suggestedResidencyScopeForExtraFeeName(headName);
  const split = defaultSplitIntoTwoInstallmentsForFeeName(headName);
  const headBase = normName(baseNameFromInstallmentFee(headName));
  const changes: StudentChange[] = [];

  for (const item of todo) {
    if (item.action === "CREATE") {
      const { ids } = await createExtraFeeRows(prisma, {
        schoolId,
        name: headName,
        amount: plan.amount,
        targetType: "STUDENT",
        targetClassId: null,
        targetSection: null,
        targetStudentId: item.studentId,
        residencyScope: suggestedScope,
        splitIntoTwoInstallments: split,
      });
      await applyStudentFeeDelta([item.studentId], item.delta);
      changes.push({ studentId: item.studentId, action: "CREATE", createdIds: ids, updated: [], previousTotal: 0, delta: item.delta });
    } else {
      const rows = await prisma.extraFee.findMany({
        where: { schoolId, targetType: "STUDENT", targetStudentId: item.studentId },
      });
      const own = rows.filter((r) => normName(baseNameFromInstallmentFee(r.name)) === headBase);
      const first = own[0];
      if (!first) throw new BulkEditConflictError("A fee changed while applying. Preview again.");
      const result = await patchExtraFeeWithInstallmentSupport(prisma, first, { amount: plan.amount });
      if (result === "no_changes") continue;
      await applyStudentFeeDelta([item.studentId], result.studentFeeDelta);
      changes.push({
        studentId: item.studentId,
        action: "UPDATE",
        createdIds: result.migrated ? result.extraFeeIds : [],
        // When the edit split a lump into two new rows, undo restores one lump at the previous amount.
        updated: own.map((r) => ({ id: r.id, previousAmount: r.amount })),
        previousTotal: result.totalBefore,
        delta: result.studentFeeDelta,
      });
    }
  }

  const batch = await prisma.feeBulkEdit.create({
    data: {
      schoolId,
      headName,
      amount: plan.amount,
      actorUserId: input.actor.userId ?? null,
      actorName: input.actor.name ?? null,
      actorRole: input.actor.role ?? null,
      changes: changes as unknown as object,
      studentCount: changes.length,
      totalDelta: roundRupee(changes.reduce((s, c) => s + c.delta, 0)),
    },
    select: { id: true },
  });

  for (const c of changes) {
    await recordFeeAudit(prisma, {
      schoolId,
      entityType: "EXTRA_FEE",
      entityId: c.createdIds[0] ?? c.updated[0]?.id ?? c.studentId,
      action: c.action === "CREATE" ? "CREATE" : "UPDATE",
      actor: input.actor,
      summary: `Bulk edit ${batch.id}: "${headName}" ${c.previousTotal} -> ${roundRupee(c.previousTotal + c.delta)}`,
      after: { bulkEditId: batch.id, studentId: c.studentId, headName, amount: plan.amount },
    });
  }

  await invalidateSchoolFeeReadCaches(schoolId);
  return {
    batchId: batch.id,
    changed: changes.length,
    skipped: plan.skipped,
    totalDelta: roundRupee(changes.reduce((s, c) => s + c.delta, 0)),
  };
}

/**
 * Undoes a whole bulk run. All-or-nothing: if a fee it created now has payments against it, nothing is
 * undone and the students are listed. Must run inside runInTenantScope.
 */
export async function undoBulkSetFeeHead(
  schoolId: string,
  batchId: string,
  actor: FeeAuditActor
): Promise<{ undone: number }> {
  const batch = await prisma.feeBulkEdit.findFirst({ where: { id: batchId, schoolId } });
  if (!batch) throw new BulkEditNotFoundError();
  if (batch.status === "UNDONE") throw new BulkEditConflictError("This bulk edit was already undone.");

  const changes = batch.changes as unknown as StudentChange[];
  const created = changes.flatMap((c) => c.createdIds);
  if (created.length > 0) {
    const paid = await prisma.paymentFeeAllocation.groupBy({
      by: ["extraFeeId"],
      where: { extraFeeId: { in: created } },
      _sum: { allocatedAmount: true },
    });
    const blocked = paid.filter((p) => (p._sum.allocatedAmount ?? 0) > 0).map((p) => p.extraFeeId);
    if (blocked.length > 0) {
      const owners = await prisma.extraFee.findMany({ where: { id: { in: blocked as string[] } }, select: { targetStudentId: true } });
      throw new BulkEditConflictError(
        `Cannot undo: payments were made on fees this edit created (${owners.length} student${owners.length === 1 ? "" : "s"}). Nothing was changed.`
      );
    }
  }

  for (const c of changes) {
    if (c.action === "CREATE") {
      await prisma.extraFee.deleteMany({ where: { id: { in: c.createdIds }, schoolId } });
      await applyStudentFeeDelta([c.studentId], -c.delta);
    } else if (c.createdIds.length > 0) {
      // The edit split a lump into two rows; put the lump back at its previous amount.
      const old = c.updated[0];
      const template = await prisma.extraFee.findFirst({ where: { id: c.createdIds[0], schoolId } });
      if (old && template) {
        await prisma.extraFee.deleteMany({ where: { id: { in: c.createdIds }, schoolId } });
        await prisma.extraFee.create({
          data: {
            schoolId,
            name: template.name.replace(/\s*\((1st|2nd) Installment\)\s*$/i, "").trim(),
            amount: c.previousTotal,
            targetType: template.targetType,
            targetClassId: template.targetClassId,
            targetSection: template.targetSection,
            targetStudentId: template.targetStudentId,
            residencyScope: template.residencyScope,
            splitIntoTwoInstallments: false,
          },
        });
      }
      await applyStudentFeeDelta([c.studentId], -c.delta);
    } else {
      for (const u of c.updated) {
        await prisma.extraFee.updateMany({ where: { id: u.id, schoolId }, data: { amount: u.previousAmount } });
      }
      await applyStudentFeeDelta([c.studentId], -c.delta);
    }
    await recordFeeAudit(prisma, {
      schoolId,
      entityType: "EXTRA_FEE",
      entityId: c.createdIds[0] ?? c.updated[0]?.id ?? c.studentId,
      action: "UPDATE",
      actor,
      summary: `Undo of bulk edit ${batchId}: "${batch.headName}" back to ${c.previousTotal}`,
      after: { bulkEditId: batchId, studentId: c.studentId, undone: true },
    });
  }

  await prisma.feeBulkEdit.update({
    where: { id: batchId },
    data: { status: "UNDONE", undoneAt: new Date(), undoneByName: actor.name ?? null },
  });
  await invalidateSchoolFeeReadCaches(schoolId);
  return { undone: changes.length };
}

export class BulkEditConflictError extends Error {}
export class BulkEditNotFoundError extends Error {
  constructor() {
    super("Bulk edit not found");
  }
}
