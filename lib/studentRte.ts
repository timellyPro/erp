/**
 * RTE (Right to Education): no tuition from the class global fee breakdown.
 * Kept in a small module so route bundles do not depend on Turbopack merging
 * `extraFeeResidencyScope` named exports incorrectly.
 */
export function isStudentRte(residencyType: string | null | undefined): boolean {
  const n = (residencyType ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return n === "rte";
}

/**
 * Catalog / extra-fee row whose label is tuition (e.g. split "TUITION FEE 1ST INSTALLMENT").
 * RTE students skip these; mess, transport, hostel, etc. stay.
 */
export function isTuitionNamedExtraFee(name: string | null | undefined): boolean {
  const n = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!n) return false;
  return n.includes("tuition");
}
