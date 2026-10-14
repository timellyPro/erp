import { randomUUID } from "crypto";

export type MarkComponentInput = {
  name: string;
  marks: number;
  totalMarks: number;
};

export function parseMarkComponents(raw: unknown): MarkComponentInput[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    throw new Error("components must be an array");
  }
  if (raw.length === 0) return [];

  const out: MarkComponentInput[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    const marks = Number(row?.marks);
    const totalMarks = Number(row?.totalMarks);
    if (!name) throw new Error("Each component needs a name");
    if (!Number.isFinite(marks) || marks < 0) {
      throw new Error(`Invalid marks for "${name}"`);
    }
    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
      throw new Error(`Invalid max marks for "${name}"`);
    }
    if (marks > totalMarks) {
      throw new Error(`Marks for "${name}" cannot exceed ${totalMarks}`);
    }
    const key = name.toUpperCase();
    if (seen.has(key)) throw new Error(`Duplicate component: ${name}`);
    seen.add(key);
    out.push({ name, marks, totalMarks });
  }
  return out;
}

export function sumComponents(components: MarkComponentInput[]) {
  return {
    marks: components.reduce((a, c) => a + c.marks, 0),
    totalMarks: components.reduce((a, c) => a + c.totalMarks, 0),
  };
}

export function componentCreateData(
  markId: string,
  components: MarkComponentInput[]
) {
  const now = new Date();
  return components.map((c) => ({
    id: randomUUID(),
    markId,
    name: c.name,
    marks: c.marks,
    totalMarks: c.totalMarks,
    updatedAt: now,
  }));
}
