import { isInstallmentFeeName } from "@/lib/extraFeeInstallments";
import { isMessCategoryExtraFeeName } from "@/lib/extraFeeResidencyScope";
import { shouldOmitLegacySplitHostelMessExtraForBreakdown } from "@/lib/studentTuitionFromStructure";

export type MessDuplicateIssue = {
  id: string;
  kind: "student_bulk" | "legacy_row" | "too_many_rows";
  classId: string | null;
  classLabel: string;
  detail: string;
  extraFeeIds: string[];
};

type ExtraFeeLike = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope?: string | null | undefined;
  splitIntoTwoInstallments?: boolean | undefined;
};

type NormalizedExtraFeeLike = Omit<ExtraFeeLike, "residencyScope"> & {
  residencyScope: string | null;
};

type ClassRef = { id: string; name: string; section: string | null };

function normalizeExtraFees(extraFees: ExtraFeeLike[]): NormalizedExtraFeeLike[] {
  return extraFees.map((e) => ({
    ...e,
    residencyScope: e.residencyScope ?? null,
  }));
}

function classLabelFromId(classes: ClassRef[], classId: string | null): string {
  if (!classId) return "—";
  const c = classes.find((x) => x.id === classId);
  return c ? `${c.name}${c.section ? `-${c.section}` : ""}` : classId;
}

/** Detect mess fee rows that should be removed (bulk student rows, legacy lumps, extra copies). */
export function findMessFeeDuplicateIssues(
  extraFees: ExtraFeeLike[],
  classes: ClassRef[]
): MessDuplicateIssue[] {
  const issues: MessDuplicateIssue[] = [];
  const normalized = normalizeExtraFees(extraFees);
  const messFees = normalized.filter((e) => isMessCategoryExtraFeeName(e.name));

  const classIdsWithClassMess = new Set(
    messFees
      .filter((e) => e.targetType === "CLASS" && e.targetClassId)
      .map((e) => e.targetClassId as string)
  );

  const studentMess = messFees.filter((e) => e.targetType === "STUDENT");
  if (studentMess.length > 0 && classIdsWithClassMess.size > 0) {
    issues.push({
      id: "student-bulk-mess",
      kind: "student_bulk",
      classId: null,
      classLabel: "School-wide",
      detail: `${studentMess.length} old per-student mess fee(s) from bulk import — class mess fees are already set`,
      extraFeeIds: studentMess.map((e) => e.id),
    });
  }

  for (const ef of messFees) {
    if (
      shouldOmitLegacySplitHostelMessExtraForBreakdown(ef, normalized, {
        classId: ef.targetClassId,
        residencyType: null,
      })
    ) {
      issues.push({
        id: `legacy-${ef.id}`,
        kind: "legacy_row",
        classId: ef.targetClassId,
        classLabel: classLabelFromId(classes, ef.targetClassId),
        detail: `Legacy duplicate row: ${ef.name} (₹${ef.amount})`,
        extraFeeIds: [ef.id],
      });
    }
  }

  for (const c of classes) {
    const rows = messFees.filter((e) => e.targetType === "CLASS" && e.targetClassId === c.id);
    if (rows.length <= 2) continue;
    const installments = rows.filter((e) => isInstallmentFeeName(e.name));
    if (installments.length <= 2 && rows.length > 2) {
      issues.push({
        id: `many-${c.id}`,
        kind: "too_many_rows",
        classId: c.id,
        classLabel: `${c.name}${c.section ? `-${c.section}` : ""}`,
        detail: `${rows.length} mess fee rows for this class (expected at most 2 installments)`,
        extraFeeIds: rows.map((e) => e.id),
      });
    }
  }

  return issues;
}

export function countMessDuplicateExtraFeeIds(issues: MessDuplicateIssue[]): number {
  const ids = new Set<string>();
  for (const i of issues) {
    for (const id of i.extraFeeIds) ids.add(id);
  }
  return ids.size;
}
