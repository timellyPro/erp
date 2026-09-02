export type ExtraFeeResidencyScope = "ALL" | "HOSTELLER" | "DAY_SCHOLAR";

export function normalizeExtraFeeResidencyScope(raw: unknown): ExtraFeeResidencyScope {
  if (raw === "HOSTELLER" || raw === "DAY_SCHOLAR" || raw === "ALL") return raw;
  return "ALL";
}

export function parseExtraFeeResidencyScopeBody(raw: unknown): ExtraFeeResidencyScope | null {
  if (raw === undefined || raw === null || raw === "") return "ALL";
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (s === "HOSTELLER" || s === "DAY_SCHOLAR" || s === "ALL") return s as ExtraFeeResidencyScope;
  return null;
}

function normFeeName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** True if the student counts as a hosteller for fee purposes (matches app-wide residency labels). */
export function isStudentHosteller(residencyType: string | null | undefined): boolean {
  const raw = (residencyType ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return false;
  if (raw === "hosteller" || raw === "hostler" || raw === "hosteler" || raw === "hoster") return true;
  return raw.includes("hostel");
}

/** Fee head name looks like mess (any school wording). */
export function isMessCategoryExtraFeeName(name: string | null | undefined): boolean {
  const n = normFeeName(name);
  return n.length > 0 && n.includes("mess");
}

/** Fee head name looks like hostel / boarding (not mess). */
export function isHostelCategoryExtraFeeName(name: string | null | undefined): boolean {
  const n = normFeeName(name);
  if (!n || isMessCategoryExtraFeeName(name)) return false;
  return n.includes("hostel") || n.includes("hostler") || n.includes("hosteler");
}

/**
 * Mess and hostel fees are always collected in two installments in this product
 * (same as class mess setup in HostelMessFeesPanel).
 */
export function defaultSplitIntoTwoInstallmentsForFeeName(
  name: string | null | undefined
): boolean {
  return isMessCategoryExtraFeeName(name) || isHostelCategoryExtraFeeName(name);
}

/** Default residency scope when creating catalog rows from fee name. */
export function suggestedResidencyScopeForExtraFeeName(
  name: string | null | undefined
): ExtraFeeResidencyScope {
  if (isHostelCategoryExtraFeeName(name)) return "HOSTELLER";
  if (isMessCategoryExtraFeeName(name)) return "DAY_SCHOLAR";
  return "ALL";
}

function residencyScopeMatches(
  feeScope: string | null | undefined,
  studentResidency: string | null | undefined
): boolean {
  const scope = normalizeExtraFeeResidencyScope(feeScope);
  if (scope === "ALL") return true;
  const host = isStudentHosteller(studentResidency);
  if (scope === "HOSTELLER") return host;
  if (scope === "DAY_SCHOLAR") return !host;
  return true;
}

/**
 * Whether this extra fee applies to the student (scope + hostel/mess rules).
 * Hostellers never get mess-category heads; day scholars never get hostel-category heads.
 */
export function extraFeeAppliesToStudent(
  fee: { name?: string | null; residencyScope?: string | null },
  studentResidency: string | null | undefined
): boolean {
  if (!residencyScopeMatches(fee.residencyScope, studentResidency)) return false;
  const host = isStudentHosteller(studentResidency);
  if (host && isMessCategoryExtraFeeName(fee.name)) return false;
  if (!host && isHostelCategoryExtraFeeName(fee.name)) return false;
  return true;
}

/** @deprecated Prefer extraFeeAppliesToStudent with fee name. Optional feeName enables hostel/mess rules. */
export function extraFeeAppliesToStudentResidency(
  feeScope: string | null | undefined,
  studentResidency: string | null | undefined,
  feeName?: string | null
): boolean {
  if (feeName !== undefined && feeName !== null && String(feeName).trim() !== "") {
    return extraFeeAppliesToStudent({ residencyScope: feeScope, name: feeName }, studentResidency);
  }
  return residencyScopeMatches(feeScope, studentResidency);
}
