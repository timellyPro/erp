import type { FeeDueColumnGroup, FeeDueReportRow } from "@/lib/fees/feeDueReportCompute";

/**
 * The due report engine makes one column group per fee-structure line (every installment, every class,
 * every transport slab). Schools read it as five heads, so installments are added together here.
 */
export type DueHeadKey = "hostel" | "mess" | "bus" | "tuition" | "admission" | "other" | "previousYear";

export type DueHeadCell = { fee: number; concession: number; paid: number; due: number };

/** Display order, and the words a fee-head name is matched on (case-insensitive). */
export const DUE_TEMPLATE_HEADS: ReadonlyArray<{ key: Exclude<DueHeadKey, "other" | "previousYear">; label: string; test: RegExp }> = [
  { key: "hostel", label: "Hostel", test: /hostel/i },
  { key: "mess", label: "Mess", test: /mess/i },
  { key: "bus", label: "Bus", test: /transport|bus/i },
  { key: "tuition", label: "Tuition", test: /tuition/i },
  { key: "admission", label: "Admission", test: /admission/i },
];

export const DUE_HEAD_ORDER: DueHeadKey[] = [...DUE_TEMPLATE_HEADS.map((h) => h.key), "other", "previousYear"];

export const DUE_HEAD_LABELS: Record<DueHeadKey, string> = {
  hostel: "Hostel",
  mess: "Mess",
  bus: "Bus",
  tuition: "Tuition",
  admission: "Admission",
  other: "Other",
  previousYear: "Previous Year",
};

export function classifyDueGroup(group: Pick<FeeDueColumnGroup, "id" | "label">): DueHeadKey {
  if (group.id.startsWith("EXTRA_NAME@previous_year_")) return "previousYear";
  return DUE_TEMPLATE_HEADS.find((h) => h.test.test(group.label))?.key ?? "other";
}

export function emptyDueCell(): DueHeadCell {
  return { fee: 0, concession: 0, paid: 0, due: 0 };
}

/** Adds one student's per-group cells into the five heads (plus "other" and previous year). */
export function aggregateRowByHead(
  row: Pick<FeeDueReportRow, "cellsByGroupId">,
  groups: ReadonlyArray<Pick<FeeDueColumnGroup, "id" | "label">>
): Record<DueHeadKey, DueHeadCell> {
  const out = Object.fromEntries(DUE_HEAD_ORDER.map((k) => [k, emptyDueCell()])) as Record<DueHeadKey, DueHeadCell>;
  const keyByGroupId = new Map(groups.map((g) => [g.id, classifyDueGroup(g)]));
  for (const [groupId, cell] of Object.entries(row.cellsByGroupId)) {
    const target = out[keyByGroupId.get(groupId) ?? "other"];
    target.fee += cell.fee;
    target.concession += cell.concession;
    target.paid += cell.paid;
    target.due += cell.due;
  }
  return out;
}
