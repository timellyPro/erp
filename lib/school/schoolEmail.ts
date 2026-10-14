export function schoolDomainFromName(name: string): string {
  const slug = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  const safe = slug || "school";
  return `${safe}.in`;
}

export function normalizeEmailDomain(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  // Accept both prefix ("myschool") and full domain ("myschool.in"); strip leading "@"
  const cleaned = raw.replace(/^@+/, "");
  const compact = cleaned.replace(/\s+/g, "");
  if (!compact) return null;

  // Prefix mode: "myschool" -> "myschool.in"
  if (!compact.includes(".")) {
    const prefix = compact
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
    if (!prefix) return null;
    return `${prefix}.in`;
  }

  // Full domain mode
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(compact)) return null;
  return compact;
}

export function emailLocalPartFromFullName(fullName: string): string {
  const slug = String(fullName || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
  return slug || `user${Date.now()}`;
}

