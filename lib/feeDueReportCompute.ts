import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { rollupOrphanExtraFeeAllocations } from "@/lib/rollupOrphanExtraFeeAllocations";
import {
  discountedSnapshotDueForHead,
  studentFeeDiscountFromRecord,
} from "@/lib/studentFeeHeadDiscount";
import {
  extraFeeAppliesToStudent,
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
} from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import { previousYearFeeHeadLabel } from "@/lib/feeYearClassification";

export type FeeDueColumnGroup = {
  /** Stable id: `BASE@classId@index`, `EXTRA_NAME@slug` (merged extras with same name), or legacy `EXTRA:id` */
  id: string;
  /** Display label for merged header / sub-headers */
  label: string;
};

export type FeeDueReportRow = {
  studentId: string;
  no: number;
  name: string;
  admissionNo: string;
  section: string;
  parent: string;
  mobile: string;
  category: string;
  totalFee: number;
  totalDiscount: number;
  feesPaid: number;
  feesDue: number;
  previousYearTotalFee?: number;
  previousYearFeesPaid?: number;
  previousYearFeesDue?: number;
  /** Amounts per fee-head group id */
  cellsByGroupId: Record<string, { fee: number; concession: number; paid: number; due: number }>;
};

export type FeeDueReportPayload = {
  schoolName: string | null;
  generatedAt: string;
  groups: FeeDueColumnGroup[];
  rows: FeeDueReportRow[];
};

type Component = { name: string; amount: number };

export type ExtraFeeLite = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope?: string | null;
};

export type StudentFeeDueInput = {
  studentId: string;
  classId: string | null;
  section: string | null;
  classDisplay: string;
  totalFee: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
  discountPercent: number;
  discountFeeHeadKey?: string | null;
  discountFeeHeadLabel?: string | null;
  name: string | null;
  admissionNo: string;
  parent: string;
  mobile: string;
  category: string | null;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * When a class/section has no ClassFeeStructure, copy components from another section
 * of the same class name so tuition heads and BASE allocations still appear in the report.
 */
export function fillMissingClassFeeStructuresFromSiblings(
  componentsByClassId: Map<string, Component[]>,
  classMeta: ReadonlyArray<{ id: string; name: string; section: string | null }>
): void {
  const byName = new Map<string, Array<{ id: string; section: string | null }>>();
  for (const c of classMeta) {
    const key = c.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ id: c.id, section: c.section });
  }
  for (const siblings of byName.values()) {
    const donor = siblings.find((s) => {
      const comps = componentsByClassId.get(s.id);
      return Array.isArray(comps) && comps.length > 0;
    });
    if (!donor) continue;
    const donorComps = componentsByClassId.get(donor.id)!;
    for (const s of siblings) {
      const existing = componentsByClassId.get(s.id);
      if (existing && existing.length > 0) continue;
      componentsByClassId.set(
        s.id,
        donorComps.map((c) => ({ name: c.name, amount: Number(c.amount) || 0 }))
      );
    }
  }
}

function extraFeeApplies(
  ef: ExtraFeeLite,
  opts: { classId: string | null; section: string | null; studentId: string }
): boolean {
  if (ef.targetType === "SCHOOL") return true;
  if (ef.targetType === "CLASS") return !!opts.classId && ef.targetClassId === opts.classId;
  if (ef.targetType === "SECTION")
    return !!opts.classId && ef.targetClassId === opts.classId && ef.targetSection === opts.section;
  if (ef.targetType === "STUDENT") return ef.targetStudentId === opts.studentId;
  return false;
}

function includeSchoolWideExtraInDueReport(ef: ExtraFeeLite, includeSchoolWideExtras: boolean): boolean {
  return (
    includeSchoolWideExtras ||
    isHostelCategoryExtraFeeName(ef.name) ||
    isMessCategoryExtraFeeName(ef.name) ||
    Boolean(previousYearFeeHeadLabel(ef.name))
  );
}

/** Extras for fee-due columns: class / section / student only (not whole-school catalog — that would add a column for every student). */
function applicableExtrasForDueReport(
  extraFees: ExtraFeeLite[],
  opts: {
    classId: string | null;
    section: string | null;
    studentId: string;
    studentResidency: string | null | undefined;
  },
  includeSchoolWideExtras: boolean
): ExtraFeeLite[] {
  return extraFees.filter((ef) => {
    if (!extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, opts.studentResidency))
      return false;
    if (isStudentRte(opts.studentResidency) && isTuitionNamedExtraFee(ef.name)) return false;
    if (ef.targetType === "SCHOOL") return includeSchoolWideExtraInDueReport(ef, includeSchoolWideExtras);
    return extraFeeApplies(ef, opts);
  });
}

function extraFeeAppliesToStudentForRoster(
  ef: ExtraFeeLite,
  st: StudentFeeDueInput,
  includeSchoolWideExtras: boolean
): boolean {
  if (!extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, st.category)) return false;
  if (isStudentRte(st.category) && isTuitionNamedExtraFee(ef.name)) return false;
  if (ef.targetType === "SCHOOL") return includeSchoolWideExtraInDueReport(ef, includeSchoolWideExtras);
  return extraFeeApplies(ef, { classId: st.classId, section: st.section, studentId: st.studentId });
}

/** Extra fee heads that apply to at least one student in the export roster. */
export function extraFeesForExportRoster(
  extraFees: ExtraFeeLite[],
  students: StudentFeeDueInput[],
  includeSchoolWideExtras: boolean
): ExtraFeeLite[] {
  return extraFees.filter((ef) =>
    students.some((st) => extraFeeAppliesToStudentForRoster(ef, st, includeSchoolWideExtras))
  );
}

/** Roster extras used for fee-due report columns (class / section / student scoped by default). */
export function extraFeesForDueReportRoster(
  extraFees: ExtraFeeLite[],
  students: StudentFeeDueInput[],
  includeSchoolWideExtras: boolean
): ExtraFeeLite[] {
  if (includeSchoolWideExtras) {
    return extraFeesForExportRoster(extraFees, students, true);
  }
  return extraFees.filter((ef) => {
    if (ef.targetType === "SCHOOL") {
      if (!includeSchoolWideExtraInDueReport(ef, false)) return false;
      return students.some((st) => extraFeeAppliesToStudentForRoster(ef, st, false));
    }
    return students.some((st) => extraFeeAppliesToStudentForRoster(ef, st, false));
  });
}

/** One column per class structure row — avoids merging different classes that share the same head name. */
function baseGroupId(classId: string | null, componentIndex: number): string {
  const cid = classId && classId.length > 0 ? classId : "_";
  return `BASE@${cid}@${componentIndex}`;
}

function parseBaseGroupId(id: string): { classId: string | null; index: number } | null {
  if (!id.startsWith("BASE@")) return null;
  const parts = id.split("@");
  if (parts.length !== 3) return null;
  const rawClass = parts[1];
  const idx = Number(parts[2]);
  if (!Number.isFinite(idx) || idx < 0) return null;
  return { classId: rawClass === "_" ? null : rawClass, index: idx };
}

function labelFromLegacyBaseGroupId(id: string): string {
  if (!id.startsWith("BASE:")) return id;
  const rest = id.slice("BASE:".length);
  const hash = rest.indexOf("#");
  if (hash === -1) return rest;
  const name = rest.slice(0, hash);
  const num = rest.slice(hash + 1);
  return `${name} (${num})`;
}

function isPreviousYearGroupId(groupId: string): boolean {
  return groupId.startsWith("EXTRA_NAME@previous_year_");
}

/** Same display name → one column (many DB rows often share a title). */
function normalizeExtraNameKey(name: string): string {
  const previousYear = previousYearFeeHeadLabel(name);
  if (previousYear) return previousYear.toLowerCase();
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function extraNameSlugFromNorm(normKey: string): string {
  const s = normKey.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  return (s.length > 0 ? s : "extra").slice(0, 96);
}

function resolveGroupLabel(
  groupId: string,
  extraFeeNameById: Map<string, string>,
  componentsByClassId: Map<string, Component[]>,
  extraDisplayBySlug: Map<string, string>
): string {
  if (groupId.startsWith("EXTRA_NAME@")) {
    const slug = groupId.slice("EXTRA_NAME@".length);
    return extraDisplayBySlug.get(slug)?.trim() || slug.replace(/_/g, " ");
  }
  if (groupId.startsWith("EXTRA:")) {
    const id = groupId.slice("EXTRA:".length);
    return extraFeeNameById.get(id)?.trim() || "Extra Fee";
  }
  const parsed = parseBaseGroupId(groupId);
  if (parsed) {
    if (parsed.classId != null) {
      const comps = componentsByClassId.get(parsed.classId) ?? [];
      const row = comps[parsed.index];
      return String(row?.name ?? "").trim() || `Component ${parsed.index + 1}`;
    }
    return `Component ${parsed.index + 1}`;
  }
  return labelFromLegacyBaseGroupId(groupId);
}

/** When two columns would show the same title, suffix with class or short id so headers are not repeated verbatim. */
function disambiguateDuplicateLabels(groups: FeeDueColumnGroup[], students: StudentFeeDueInput[]): FeeDueColumnGroup[] {
  const classDisplayByClassId = new Map<string, string>();
  for (const s of students) {
    if (s.classId) classDisplayByClassId.set(s.classId, s.classDisplay);
  }
  const seen = new Map<string, number>();
  return groups.map((g) => {
    const norm = g.label.trim().toLowerCase();
    const n = (seen.get(norm) ?? 0) + 1;
    seen.set(norm, n);
    if (n === 1) return g;

    const base = parseBaseGroupId(g.id);
    if (base?.classId) {
      const disp = classDisplayByClassId.get(base.classId);
      if (disp) return { ...g, label: `${g.label} · ${disp}` };
    }
    if (g.id.startsWith("EXTRA:")) {
      const shortId = g.id.slice("EXTRA:".length).slice(-6);
      return { ...g, label: `${g.label} · ${shortId}` };
    }
    if (g.id.startsWith("EXTRA_NAME@")) {
      return { ...g, label: `${g.label} · ${n}` };
    }
    return { ...g, label: `${g.label} · ${n}` };
  });
}

function cellHasActivity(c: { fee: number; concession: number; paid: number; due: number } | undefined): boolean {
  if (!c) return false;
  const t = 1e-6;
  return (
    Math.abs(c.fee) >= t ||
    Math.abs(c.concession) >= t ||
    Math.abs(c.paid) >= t ||
    Math.abs(c.due) >= t
  );
}

type HeadRow = {
  groupId: string;
  headKey: string;
  snapshotDue: number;
  gross: number;
  concession: number;
  /** Extra fee ids merged into this EXTRA_NAME column (for orphan rollup + discounts). */
  extraFeeIds?: string[];
};

function computeStudentHeads(
  fee: StudentFeeDueInput,
  componentsByClassId: Map<string, Component[]>,
  extraFees: ExtraFeeLite[],
  netPaidByStudentHead: Map<string, number>,
  includeSchoolWideExtras: boolean,
  extraFeesById: Map<string, { id: string; name: string }>
): Record<string, { fee: number; concession: number; paid: number; due: number }> {
  const classId = fee.classId;
  const section = fee.section;
  const baseComponents = classId ? componentsByClassId.get(classId) ?? [] : [];
  const discount = studentFeeDiscountFromRecord(
    {
      discountPercent: fee.discountPercent,
      totalFee: fee.totalFee,
      finalFee: fee.finalFee,
      discountFeeHeadKey: fee.discountFeeHeadKey,
      discountFeeHeadLabel: fee.discountFeeHeadLabel,
    },
    baseComponents
  );

  const applicable = applicableExtrasForDueReport(
    extraFees,
    {
      classId,
      section,
      studentId: fee.studentId,
      studentResidency: fee.category,
    },
    includeSchoolWideExtras
  );

  const rte = isStudentRte(fee.category);
  const heads: HeadRow[] = [];
  for (let i = 0; i < baseComponents.length; i++) {
    const gross = rte ? 0 : Number(baseComponents[i]?.amount) || 0;
    const headKey = `BASE:${i}`;
    const snapshotDue = roundMoney(discountedSnapshotDueForHead(headKey, gross, discount));
    const concession = roundMoney(Math.max(gross - snapshotDue, 0));
    const groupId = baseGroupId(classId, i);
    heads.push({ groupId, headKey, snapshotDue, gross, concession });
  }

  const extraByNorm = new Map<string, ExtraFeeLite[]>();
  for (const ef of applicable) {
    const nk = normalizeExtraNameKey(ef.name);
    if (!extraByNorm.has(nk)) extraByNorm.set(nk, []);
    extraByNorm.get(nk)!.push(ef);
  }
  const normKeys = [...extraByNorm.keys()].sort((a, b) => a.localeCompare(b));
  for (const nk of normKeys) {
    const efs = extraByNorm.get(nk)!;
    const slug = extraNameSlugFromNorm(nk);
    const groupId = `EXTRA_NAME@${slug}`;
    const headKey = groupId;
    let gross = 0;
    let snapshotDue = 0;
    for (const ef of efs) {
      const g = Number(ef.amount) || 0;
      gross += g;
      snapshotDue += discountedSnapshotDueForHead(`EXTRA:${ef.id}`, g, discount);
    }
    snapshotDue = roundMoney(snapshotDue);
    gross = roundMoney(gross);
    const concession = roundMoney(Math.max(gross - snapshotDue, 0));
    heads.push({
      groupId,
      headKey,
      snapshotDue,
      gross,
      concession,
      extraFeeIds: efs.map((e) => e.id),
    });
  }

  // Build EXTRA:id / BASE:n paid map, roll orphan extra ids onto live installment ids, then fold.
  const idKeyed = new Map<string, number>();
  for (const [composed, amount] of netPaidByStudentHead.entries()) {
    if (!composed.startsWith(`${fee.studentId}|`)) continue;
    idKeyed.set(composed.slice(`${fee.studentId}|`.length), amount);
  }
  rollupOrphanExtraFeeAllocations(
    idKeyed,
    heads.flatMap((h) =>
      (h.extraFeeIds ?? []).map((id) => ({
        key: `EXTRA:${id}`,
        label: extraFeesById.get(id)?.name ?? h.groupId,
        extraFeeId: id,
        snapshotDue: h.snapshotDue,
      }))
    ),
    extraFeesById
  );

  const netPaidByHead = new Map<string, number>();
  for (const h of heads) {
    if (h.extraFeeIds?.length) {
      let mergedNet = 0;
      for (const id of h.extraFeeIds) {
        mergedNet += idKeyed.get(`EXTRA:${id}`) ?? 0;
      }
      netPaidByHead.set(h.headKey, mergedNet);
    } else {
      netPaidByHead.set(h.headKey, idKeyed.get(h.headKey) ?? 0);
    }
  }

  redistributeBaseMinusOneAllocations(
    netPaidByHead,
    heads.map((h) => ({ key: h.headKey, snapshotDue: h.snapshotDue }))
  );

  /**
   * Per-head paid comes from allocations only — never spread leftover StudentFee.amountPaid
   * across heads (that marked unpaid installments as paid). Cap at snapshot so overpay on
   * one head cannot inflate "Fees paid" above that head's due.
   */
  const cells: Record<string, { fee: number; concession: number; paid: number; due: number }> = {};
  for (const h of heads) {
    const paidAlloc = Math.max(netPaidByHead.get(h.headKey) ?? 0, 0);
    const paidApplied = roundMoney(Math.min(paidAlloc, h.snapshotDue));
    const dueBefore = roundMoney(Math.max(h.snapshotDue - paidApplied, 0));

    const cur = cells[h.groupId] ?? { fee: 0, concession: 0, paid: 0, due: 0 };
    cur.fee += h.gross;
    cur.concession += h.concession;
    cur.paid += paidApplied;
    cur.due += dueBefore;
    cells[h.groupId] = cur;
  }

  return cells;
}

export function buildFeeDueReportPayload(args: {
  schoolName: string | null;
  extraFees: ExtraFeeLite[];
  students: StudentFeeDueInput[];
  /** Map key `${studentId}|${headKey}` -> net allocated (payments minus refunds) */
  netPaidByStudentHead: Map<string, number>;
  componentsByClassId: Map<string, Component[]>;
  /** When true, include SCHOOL-wide extra fees (one column each for every catalog row). Default false — huge width and not class-specific. */
  includeSchoolWideExtras?: boolean;
  /**
   * Optional full extra-fee id→name map (including fees not on the roster columns) so orphan
   * allocations can roll onto matching installment heads by name.
   */
  extraFeesById?: Map<string, { id: string; name: string }>;
}): FeeDueReportPayload {
  const includeSchoolWideExtras = Boolean(args.includeSchoolWideExtras);

  const sortedStudents = [...args.students].sort((a, b) => {
    const sa = `${a.classDisplay}\u0000${a.name ?? ""}`;
    const sb = `${b.classDisplay}\u0000${b.name ?? ""}`;
    return sa.localeCompare(sb);
  });

  const rosterExtras = extraFeesForDueReportRoster(args.extraFees, sortedStudents, includeSchoolWideExtras);
  const extraFeesById =
    args.extraFeesById ??
    new Map(args.extraFees.map((e) => [e.id, { id: e.id, name: e.name }]));
  const extraFeeNameById = new Map(rosterExtras.map((e) => [e.id, e.name]));

  const extraDisplayBySlug = new Map<string, string>();
  for (const ef of rosterExtras) {
    const nk = normalizeExtraNameKey(ef.name);
    const slug = extraNameSlugFromNorm(nk);
    const nm = previousYearFeeHeadLabel(ef.name) ?? ef.name.trim();
    const prev = extraDisplayBySlug.get(slug);
    if (!prev || nm.length > prev.length) extraDisplayBySlug.set(slug, nm);
  }

  /** Column order = first time a head appears walking students (class/student-applicable heads only). */
  const orderedGroupIds: string[] = [];
  const seenGroup = new Set<string>();

  const rows: FeeDueReportRow[] = [];
  let no = 1;
  for (const s of sortedStudents) {
    const cells = computeStudentHeads(
      s,
      args.componentsByClassId,
      rosterExtras,
      args.netPaidByStudentHead,
      includeSchoolWideExtras,
      extraFeesById
    );
    for (const gid of Object.keys(cells)) {
      if (!seenGroup.has(gid)) {
        seenGroup.add(gid);
        orderedGroupIds.push(gid);
      }
    }
    const currentYearCells = Object.entries(cells)
      .filter(([groupId]) => !isPreviousYearGroupId(groupId))
      .map(([, cell]) => cell);
    const currentYearTotalFee = currentYearCells.reduce((sum, cell) => sum + cell.fee, 0);
    const currentYearTotalDiscount = currentYearCells.reduce((sum, cell) => sum + cell.concession, 0);
    const currentYearFeesPaid = currentYearCells.reduce((sum, cell) => sum + cell.paid, 0);
    const currentYearFeesDue = currentYearCells.reduce((sum, cell) => sum + cell.due, 0);
    const previousYearCells = Object.entries(cells)
      .filter(([groupId]) => isPreviousYearGroupId(groupId))
      .map(([, cell]) => cell);
    const previousYearTotalFee = previousYearCells.reduce((sum, cell) => sum + cell.fee, 0);
    const previousYearFeesPaid = previousYearCells.reduce((sum, cell) => sum + cell.paid, 0);
    const previousYearFeesDue = previousYearCells.reduce((sum, cell) => sum + cell.due, 0);
    rows.push({
      studentId: s.studentId,
      no: no++,
      name: s.name?.trim() || "-",
      admissionNo: s.admissionNo,
      section: s.classDisplay,
      parent: s.parent,
      mobile: s.mobile,
      category: (s.category || "Day Scholar").trim() || "Day Scholar",
      totalFee: roundMoney(currentYearTotalFee),
      totalDiscount: roundMoney(currentYearTotalDiscount),
      feesPaid: roundMoney(currentYearFeesPaid),
      feesDue: roundMoney(currentYearFeesDue),
      previousYearTotalFee: roundMoney(previousYearTotalFee),
      previousYearFeesPaid: roundMoney(previousYearFeesPaid),
      previousYearFeesDue: roundMoney(previousYearFeesDue),
      cellsByGroupId: cells,
    });
  }

  const activeGroupIds = orderedGroupIds.filter((gid) => rows.some((r) => cellHasActivity(r.cellsByGroupId[gid])));
  const groupsRaw: FeeDueColumnGroup[] = activeGroupIds.map((id) => ({
    id,
    label: resolveGroupLabel(id, extraFeeNameById, args.componentsByClassId, extraDisplayBySlug),
  }));
  const groups = disambiguateDuplicateLabels(groupsRaw, sortedStudents);

  return {
    schoolName: args.schoolName,
    generatedAt: new Date().toISOString(),
    groups,
    rows,
  };
}

/** Row 2 headers: `${base} Fee`, `${base} Concession`, … matching common fee-due report layout */
export function feeDueGroupHeaderNames(label: string): { fee: string; concession: string; paid: string; due: string } {
  const raw = label.trim();
  const base = raw.replace(/\s+fee$/i, "").trim() || raw;
  return {
    fee: `${base} Fee`,
    concession: `${base} Concession`,
    paid: `${base} Fee Paid`,
    due: `${base} Fee Due`,
  };
}
