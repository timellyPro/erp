/** Display label for a staff user who collected an offline payment. */
export function userCollectorDisplayLabel(user: {
  name?: string | null;
  email?: string | null;
} | null | undefined): string | null {
  const name = (user?.name || "").trim();
  if (name) return name;
  const email = (user?.email || "").trim();
  if (email) return email;
  return null;
}

const PLACEHOLDER_COLLECTOR_NAMES = new Set(["-", "—", "unassigned"]);

function isPlaceholderCollectorName(value: string | null | undefined): boolean {
  const trimmed = (value || "").trim();
  if (!trimmed) return true;
  return PLACEHOLDER_COLLECTOR_NAMES.has(trimmed.toLowerCase());
}

/** Resolve collector name for fee reports — payment snapshot first, then linked user. */
export function resolvePaymentCollectorDisplayName(
  collectedByName: string | null | undefined,
  collectedByUser: { name?: string | null; email?: string | null } | null | undefined,
  collectedByUserId?: string | null,
  userLabelById?: ReadonlyMap<string, string>
): string | null {
  const direct = (collectedByName || "").trim();
  if (direct && !isPlaceholderCollectorName(direct)) {
    return direct;
  }

  if (collectedByUserId) {
    const fromRelation = userCollectorDisplayLabel(collectedByUser);
    if (fromRelation) return fromRelation;
    if (userLabelById?.has(collectedByUserId)) {
      return userLabelById.get(collectedByUserId) ?? null;
    }
  }

  if (direct) return direct;
  return null;
}

/** Label for Excel / PDF staff rows when no name could be resolved. */
export function offlineCollectorReportLabel(tx: {
  collectedByName?: string | null;
  collectedByUserId?: string | null;
}): string {
  const name = (tx.collectedByName || "").trim();
  if (name) return name;
  return "Other offline collections";
}

export function isAdmissionDayReportTx(tx: { id: string }): boolean {
  return tx.id.startsWith("admission-");
}
