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

/** True if the student counts as a hosteller for fee purposes (matches app-wide residency labels). */
export function isStudentHosteller(residencyType: string | null | undefined): boolean {
  const raw = (residencyType ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return false;
  if (raw === "hosteller" || raw === "hostler" || raw === "hosteler" || raw === "hoster") return true;
  return raw.includes("hostel");
}

/** Whether an extra fee row applies to this student's residency category. */
export function extraFeeAppliesToStudentResidency(
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
