import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";

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
  name: string | null;
  admissionNo: string;
  parent: string;
  mobile: string;
  category: string | null;
};

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
    if (ef.targetType === "SCHOOL") return includeSchoolWideExtras;
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
  if (ef.targetType === "SCHOOL") return includeSchoolWideExtras;
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
    if (ef.targetType === "SCHOOL") return false;
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

function previousYearDueLabel(name: string): string | null {
  const compact = name.trim().replace(/\s+/g, " ");
  const lower = compact.toLowerCase();
  if (!lower.includes("last year") || !lower.includes("fee due")) return null;

  const yearRange = lower.match(/20\d{2}\s*[-/]\s*(?:20)?\d{2}/)?.[0];
  if (!yearRange) return "Previous Year Fee Due";

  const parts = yearRange.split(/[-/]/).map((part) => part.trim());
  const start = parts[0] ?? "";
  const rawEnd = parts[1] ?? "";
  const end = rawEnd.length === 2 ? `${start.slice(0, 2)}${rawEnd}` : rawEnd;
  return `Previous Year ${start}-${end} Fee Due`;
}

function isPreviousYearGroupId(groupId: string): boolean {
  return groupId.startsWith("EXTRA_NAME@previous_year_");
}

/** Same display name → one column (many DB rows often share a title). */
function normalizeExtraNameKey(name: string): string {
  const previousYear = previousYearDueLabel(name);
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
  /** When set, use this instead of looking up `${studentId}|${headKey}` for net allocations. */
  mergedExtraNetPaid?: number;
};

function computeStudentHeads(
  fee: StudentFeeDueInput,
  componentsByClassId: Map<string, Component[]>,
  extraFees: ExtraFeeLite[],
  netPaidByStudentHead: Map<string, number>,
  includeSchoolWideExtras: boolean
): Record<string, { fee: number; concession: number; paid: number; due: number }> {
  const classId = fee.classId;
  const section = fee.section;
  const structMult = structureMultiplierAfterDiscount(fee.discountPercent);
  const baseComponents = classId ? componentsByClassId.get(classId) ?? [] : [];

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
    const snapshotDue = gross * structMult;
    const concession = Math.max(gross - snapshotDue, 0);
    const groupId = baseGroupId(classId, i);
    heads.push({ groupId, headKey: `BASE:${i}`, snapshotDue, gross, concession });
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
    const gross = efs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const slug = extraNameSlugFromNorm(nk);
    const groupId = `EXTRA_NAME@${slug}`;
    const headKey = groupId;
    let mergedNet = 0;
    for (const ef of efs) {
      mergedNet += netPaidByStudentHead.get(`${fee.studentId}|EXTRA:${ef.id}`) ?? 0;
    }
    heads.push({
      groupId,
      headKey,
      snapshotDue: gross,
      gross,
      concession: 0,
      mergedExtraNetPaid: mergedNet,
    });
  }

  const netPaidByHead = new Map<string, number>();
  for (const h of heads) {
    if (typeof h.mergedExtraNetPaid === "number") {
      netPaidByHead.set(h.headKey, h.mergedExtraNetPaid);
    } else {
      const k = `${fee.studentId}|${h.headKey}`;
      netPaidByHead.set(h.headKey, netPaidByStudentHead.get(k) ?? 0);
    }
  }
  redistributeBaseMinusOneAllocations(
    netPaidByHead,
    heads.map((h) => ({ key: h.headKey, snapshotDue: h.snapshotDue }))
  );

  const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
  const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
  const totalSnapshotDue = Math.max(heads.reduce((s, h) => s + h.snapshotDue, 0), 0);

  const cells: Record<string, { fee: number; concession: number; paid: number; due: number }> = {};
  for (const h of heads) {
    const paidAlloc = netPaidByHead.get(h.headKey) ?? 0;
    const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
    const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
    const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);

    const cur = cells[h.groupId] ?? { fee: 0, concession: 0, paid: 0, due: 0 };
    cur.fee += h.gross;
    cur.concession += h.concession;
    cur.paid += paidBefore;
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
}): FeeDueReportPayload {
  const includeSchoolWideExtras = Boolean(args.includeSchoolWideExtras);

  const sortedStudents = [...args.students].sort((a, b) => {
    const sa = `${a.classDisplay}\u0000${a.name ?? ""}`;
    const sb = `${b.classDisplay}\u0000${b.name ?? ""}`;
    return sa.localeCompare(sb);
  });

  const rosterExtras = extraFeesForDueReportRoster(args.extraFees, sortedStudents, includeSchoolWideExtras);
  const extraFeeNameById = new Map(rosterExtras.map((e) => [e.id, e.name]));

  const extraDisplayBySlug = new Map<string, string>();
  for (const ef of rosterExtras) {
    const nk = normalizeExtraNameKey(ef.name);
    const slug = extraNameSlugFromNorm(nk);
    const nm = previousYearDueLabel(ef.name) ?? ef.name.trim();
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
      includeSchoolWideExtras
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
    rows.push({
      studentId: s.studentId,
      no: no++,
      name: s.name?.trim() || "-",
      admissionNo: s.admissionNo,
      section: s.classDisplay,
      parent: s.parent,
      mobile: s.mobile,
      category: (s.category || "Day Scholar").trim() || "Day Scholar",
      totalFee: currentYearTotalFee,
      totalDiscount: currentYearTotalDiscount,
      feesPaid: currentYearFeesPaid,
      feesDue: currentYearFeesDue,
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
