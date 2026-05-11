/**
 * Canonical stored value for hostel students remains "Hosteller" (DB / APIs).
 * Use this helper anywhere the label should read "Hostel" for users.
 */
export function formatResidencyTypeForDisplay(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "Day Scholar";
  const n = raw.toLowerCase().replace(/\s+/g, "");
  if (n === "dayscholar" || n === "dayscholer") return "Day Scholar";
  if (n === "rte") return "RTE";
  if (
    n === "hostel" ||
    n === "hosteller" ||
    n === "hostler" ||
    n === "hosteler" ||
    n === "hoster"
  ) {
    return "Hostel";
  }
  return raw;
}
