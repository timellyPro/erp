import { defaultSplitIntoTwoInstallmentsForFeeName } from "@/lib/extraFeeResidencyScope";

/**
 * Generic two-installment extra fees: persisted as two ExtraFee rows (50% + 50%),
 * not one lump with UI-only splitting.
 */

export const INSTALLMENT_1_LABEL = "(1st Installment)";
export const INSTALLMENT_2_LABEL = "(2nd Installment)";

export function splitAmountInHalf(total: number): [number, number] {
  const t = Number(total) || 0;
  const first = Math.round((t / 2) * 100) / 100;
  const second = Math.round((t - first) * 100) / 100;
  return [first, second];
}

function normName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Fee name already denotes 1st or 2nd installment (stored as its own row). */
export function isInstallmentFeeName(name: string | null | undefined): boolean {
  const n = normName(name ?? "");
  if (!n) return false;
  if (n.endsWith(normName(INSTALLMENT_1_LABEL))) return true;
  if (n.endsWith(normName(INSTALLMENT_2_LABEL))) return true;
  return (
    /\b1st\b/.test(n) &&
    (n.includes("installment") || n.includes("instalment"))
  ) || (
    /\b2nd\b/.test(n) &&
    (n.includes("installment") || n.includes("instalment"))
  );
}

export function installmentIndexFromName(name: string | null | undefined): 1 | 2 | null {
  const n = normName(name ?? "");
  if (!n) return null;
  if (n.endsWith(normName(INSTALLMENT_1_LABEL))) return 1;
  if (n.endsWith(normName(INSTALLMENT_2_LABEL))) return 2;
  if (/\b1st\b/.test(n) && (n.includes("installment") || n.includes("instalment"))) return 1;
  if (/\b2nd\b/.test(n) && (n.includes("installment") || n.includes("instalment"))) return 2;
  return null;
}

function stripOneInstallmentSuffix(raw: string): string {
  if (raw.endsWith(INSTALLMENT_1_LABEL)) return raw.slice(0, -INSTALLMENT_1_LABEL.length).trim();
  if (raw.endsWith(INSTALLMENT_2_LABEL)) return raw.slice(0, -INSTALLMENT_2_LABEL.length).trim();
  return raw
    .replace(/\s*\(?\s*1st\s+installment\s*\)?\s*$/i, "")
    .replace(/\s*\(?\s*2nd\s+installment\s*\)?\s*$/i, "")
    .trim();
}

/** Strip repeated installment suffixes; canonical base for pairing and cleanup. */
export function baseNameFromInstallmentFee(name: string): string {
  let raw = String(name ?? "").trim();
  for (let i = 0; i < 8; i++) {
    if (!installmentIndexFromName(raw)) break;
    const next = stripOneInstallmentSuffix(raw);
    if (!next || next === raw) break;
    raw = next;
  }
  return raw
    .replace(/\s*\(\s*[12](?:st|nd)\s+installment\s*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized base for grouping hostel/mess rows (handles garbled duplicate suffixes). */
export function canonicalExtraFeeBaseName(name: string): string {
  return stripInstallmentPhrasesFromName(baseNameFromInstallmentFee(String(name ?? "").trim()));
}

/** Remove all 1st/2nd installment phrases and fix broken " - - " from legacy names. */
export function stripInstallmentPhrasesFromName(name: string): string {
  return String(name ?? "")
    .replace(/\(\s*[12](?:st|nd)\s+installment\s*\)/gi, " ")
    .replace(/\b[12](?:st|nd)\s+installment\b/gi, " ")
    .replace(/\s*-\s*-\s*/g, " ")
    .replace(/\s+-{2,}\s*/g, " ")
    .replace(/^\s*[-–]+\s*|\s*[-–]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildInstallmentFeeNames(baseName: string): [string, string] {
  const base = String(baseName ?? "").trim();
  return [`${base} ${INSTALLMENT_1_LABEL}`, `${base} ${INSTALLMENT_2_LABEL}`];
}

/** True when create/update should write two DB rows instead of one lump + UI split. */
export function shouldPersistAsTwoInstallmentRecords(
  splitIntoTwoInstallments: boolean,
  name: string
): boolean {
  return Boolean(splitIntoTwoInstallments) && !isInstallmentFeeName(name);
}

export type ExtraFeeLike = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope?: string | null;
  splitIntoTwoInstallments?: boolean;
};

/** Find 1st/2nd installment rows sharing the same base name and target scope. */
export function findInstallmentPair<T extends ExtraFeeLike>(
  fees: T[],
  baseName: string,
  match: (fee: T) => boolean
): { first: T; second: T } | null {
  const baseNorm = normName(baseName);
  const [n1, n2] = buildInstallmentFeeNames(baseName);
  const first =
    fees.find((f) => match(f) && normName(f.name) === normName(n1)) ??
    fees.find((f) => match(f) && installmentIndexFromName(f.name) === 1 && normName(baseNameFromInstallmentFee(f.name)) === baseNorm);
  const second =
    fees.find((f) => match(f) && normName(f.name) === normName(n2)) ??
    fees.find((f) => match(f) && installmentIndexFromName(f.name) === 2 && normName(baseNameFromInstallmentFee(f.name)) === baseNorm);
  if (first && second) return { first, second };
  return null;
}

/** Lump row that should be two DB installment rows (flag set, or mess/hostel by product rule). */
export function isUnsplitLumpExtraFee(fee: Pick<ExtraFeeLike, "name" | "splitIntoTwoInstallments">): boolean {
  if (isInstallmentFeeName(fee.name)) return false;
  return Boolean(fee.splitIntoTwoInstallments) || defaultSplitIntoTwoInstallmentsForFeeName(fee.name);
}

/** PATCH/POST should split this single row into two installment rows in the database. */
export function shouldMigrateLumpToInstallmentsOnPatch(
  fee: Pick<ExtraFeeLike, "name" | "splitIntoTwoInstallments">,
  wantsSplit: boolean
): boolean {
  if (isInstallmentFeeName(fee.name)) return false;
  return wantsSplit || isUnsplitLumpExtraFee(fee);
}

function sameExtraFeeTargetScope(a: ExtraFeeLike, b: ExtraFeeLike): boolean {
  return (
    a.targetType === b.targetType &&
    a.targetClassId === b.targetClassId &&
    a.targetSection === b.targetSection &&
    a.targetStudentId === b.targetStudentId &&
    (a.residencyScope ?? "ALL") === (b.residencyScope ?? "ALL")
  );
}

/**
 * For fee pickers (admission assign, catalog): merge DB installment pairs into one selectable head
 * with combined amount and splitIntoTwoInstallments=true (any fee name — mess, transport, hostel, etc.).
 */
export function groupExtraFeesForCatalogPicker<T extends ExtraFeeLike>(fees: T[]): Array<
  T & { displayAmount: number; splitIntoTwoInstallments: boolean }
> {
  const out: Array<T & { displayAmount: number; splitIntoTwoInstallments: boolean }> = [];
  const used = new Set<string>();

  for (const f of fees) {
    if (used.has(f.id)) continue;

    const base = isInstallmentFeeName(f.name) ? baseNameFromInstallmentFee(f.name) : f.name;
    const pair = findInstallmentPair(fees, base, (x) => !used.has(x.id) && sameExtraFeeTargetScope(f, x));

    if (pair) {
      used.add(pair.first.id);
      used.add(pair.second.id);
      const total = (Number(pair.first.amount) || 0) + (Number(pair.second.amount) || 0);
      out.push({
        ...pair.first,
        name: base,
        amount: total,
        displayAmount: total,
        splitIntoTwoInstallments: true,
      });
      continue;
    }

    if (isUnsplitLumpExtraFee(f)) {
      used.add(f.id);
      const amt = Number(f.amount) || 0;
      out.push({
        ...f,
        displayAmount: amt,
        splitIntoTwoInstallments: true,
      });
      continue;
    }

    used.add(f.id);
    const amt = Number(f.amount) || 0;
    out.push({
      ...f,
      displayAmount: amt,
      splitIntoTwoInstallments:
        Boolean(f.splitIntoTwoInstallments) || defaultSplitIntoTwoInstallmentsForFeeName(f.name),
    });
  }

  return out;
}
