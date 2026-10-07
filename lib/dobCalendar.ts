/**
 * Date-of-birth helpers.
 *
 * DOBs are calendar dates (no time-of-day). Storing/displaying via `toISOString().slice(0, 10)`
 * shifts the day for India (UTC+5:30) when the value was saved as local midnight.
 * We always format in Asia/Kolkata and parse inputs to UTC noon on that calendar day.
 */

const DOB_TIME_ZONE = "Asia/Kolkata";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD for a Date in the school timezone (India). */
export function formatDobYmd(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    // Already a plain calendar date from the client/API — trust it
    const plain = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (plain) return `${plain[1]}-${plain[2]}-${plain[3]}`;

    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      const prefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return prefix ? `${prefix[1]}-${prefix[2]}-${prefix[3]}` : "";
    }
    return formatDateInTimeZone(d);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return formatDateInTimeZone(value);
  }

  return "";
}

function formatDateInTimeZone(date: Date): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DOB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Display as DD-MM-YYYY */
export function formatDobDisplay(value: Date | string | null | undefined): string {
  const ymd = formatDobYmd(value);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Parse a DOB from form/CSV into a Date at UTC noon on that calendar day.
 * Avoids off-by-one when round-tripping through ISO / Postgres timestamptz.
 */
export function parseDobToDate(raw: string | Date | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const ymd = formatDobYmd(raw);
    if (!ymd) return null;
    return parseDobToDate(ymd);
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // YYYY-MM-DD (HTML date input / ISO prefix)
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  }

  // DD/MM/YYYY or DD-MM-YYYY (common in India / Excel)
  m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) return null;
  const ymd = formatDobYmd(fallback);
  return ymd ? parseDobToDate(ymd) : null;
}

export function ageFromDob(value: Date | string | null | undefined): number | null {
  const ymd = formatDobYmd(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const todayYmd = formatDateInTimeZone(new Date());
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age >= 0 && Number.isFinite(age) ? age : null;
}

export function toDobDateInputValue(value: Date | string | null | undefined): string {
  return formatDobYmd(value);
}
