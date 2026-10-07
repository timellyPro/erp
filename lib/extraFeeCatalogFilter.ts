import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
} from "@/lib/extraFeeResidencyScope";

export type StudentClassContext = {
  classId?: string | null;
  section?: string | null;
};

export type ClassRow = {
  id: string;
  name: string;
  section?: string | null;
};

export type CatalogExtraRow = {
  targetType?: string | null;
  targetClassId?: string | null;
  targetSection?: string | null;
  name?: string | null;
};

function normSection(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function feeClassMatchesStudent(
  fee: CatalogExtraRow,
  student: StudentClassContext,
  classRows?: ClassRow[]
): boolean {
  const feeClassId = String(fee.targetClassId ?? "").trim();
  const studentClassId = String(student.classId ?? "").trim();
  if (!feeClassId || !studentClassId) return false;
  if (feeClassId === studentClassId) return true;
  if (!classRows?.length) return false;

  const feeCls = classRows.find((c) => c.id === feeClassId);
  const stCls = classRows.find((c) => c.id === studentClassId);
  if (!feeCls || !stCls) return false;

  return (
    feeCls.name.trim().toLowerCase() === stCls.name.trim().toLowerCase() &&
    normSection(feeCls.section) === normSection(stCls.section)
  );
}

/** True when a CLASS / SECTION catalog row belongs to this student's class (and section if set). */
export function catalogExtraMatchesStudentClass(
  fee: CatalogExtraRow,
  student: StudentClassContext,
  classRows?: ClassRow[]
): boolean {
  const targetType = String(fee.targetType ?? "").toUpperCase();
  if (targetType === "SCHOOL") return true;

  const studentClassId = String(student.classId ?? "").trim();
  if (!studentClassId) return false;

  if (targetType === "CLASS") {
    return feeClassMatchesStudent(fee, student, classRows);
  }

  if (targetType === "SECTION") {
    if (!feeClassMatchesStudent(fee, student, classRows)) return false;
    const feeSec = normSection(fee.targetSection);
    const studentSec = normSection(student.section);
    if (feeSec && studentSec && feeSec !== studentSec) return false;
    return true;
  }

  return false;
}

export function resolveStudentClassContext(
  input: StudentClassContext,
  classRows?: ClassRow[]
): StudentClassContext {
  const classId = String(input.classId ?? "").trim();
  if (!classId) return { classId: null, section: input.section ?? null };

  const row = classRows?.find((c) => c.id === classId);
  return {
    classId,
    section: input.section ?? row?.section ?? null,
  };
}

/**
 * Fee-head catalog for assign-fees pickers:
 * - Mess / hostel: school-wide + this student's class only (not other classes).
 * - Other heads: school-wide + this class/section only.
 */
export function filterCatalogExtrasForStudentPicker<T extends CatalogExtraRow>(
  extras: T[],
  student: StudentClassContext,
  options?: { classRows?: ClassRow[] }
): T[] {
  const classRows = options?.classRows;
  const ctx = resolveStudentClassContext(student, classRows);

  return extras.filter((fee) => {
    const targetType = String(fee.targetType ?? "").toUpperCase();
    const messOrHostel =
      isMessCategoryExtraFeeName(fee.name) || isHostelCategoryExtraFeeName(fee.name);

    if (messOrHostel) {
      if (targetType === "SCHOOL") return true;
      return catalogExtraMatchesStudentClass(fee, ctx, classRows);
    }

    if (targetType === "SCHOOL") return true;
    return catalogExtraMatchesStudentClass(fee, ctx, classRows);
  });
}
