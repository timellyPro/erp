/** Segments like "-" / "000000" come from admission form placeholders; omit from composed address. */
export function isPlaceholderAddressSegment(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (t === "-" || t === "—" || t === "–") return true;
  if (/^[-–—\s]+$/.test(t)) return true;
  if (/^0+$/.test(t)) return true;
  if (/^n\/?a$/i.test(t)) return true;
  return false;
}

export function buildAddressFromParts(parts: Array<string | null | undefined>): string {
  const cleaned = parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((s) => s.length > 0 && !isPlaceholderAddressSegment(s));
  return cleaned.join(", ").trim();
}

/** For profile UI: drop placeholder comma-parts and end with a single full stop. */
export function formatStoredAddressForDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isPlaceholderAddressSegment(p));

  const uniqueOrdered = parts.filter(
    (p, idx) => parts.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === idx
  );

  if (uniqueOrdered.length === 0) return "—";

  let out = uniqueOrdered.join(", ").trim();
  out = out.replace(/,\s*$/g, "").trim();

  if (!/[.!?]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}
