/** Separates exam type from subject in SchoolSettings.hiddenExamSubjects. */
export const EXAM_SUBJECT_HIDE_SEP = "\u001e";

export function examTypeSubjectHideKey(examType: string, subject: string): string {
  return `${examType.trim().toUpperCase()}${EXAM_SUBJECT_HIDE_SEP}${subject.trim().toUpperCase()}`;
}

export function splitExamSubjectHideKey(
  entry: string
): { examType: string; subject: string } | null {
  const key = entry.trim().toUpperCase();
  const idx = key.indexOf(EXAM_SUBJECT_HIDE_SEP);
  if (idx <= 0) return null;
  const examType = key.slice(0, idx).trim();
  const subject = key.slice(idx + EXAM_SUBJECT_HIDE_SEP.length).trim();
  if (!examType || !subject) return null;
  return { examType, subject };
}

/** Names hidden from the whole school catalog (not per-exam removals). */
export function globalHiddenSubjectNames(hidden: string[]): Set<string> {
  const names = new Set<string>();
  for (const entry of hidden) {
    const key = entry.trim().toUpperCase();
    if (!key || splitExamSubjectHideKey(key)) continue;
    names.add(key);
  }
  return names;
}

export function removedSubjectsByExam(hidden: string[]): Record<string, string[]> {
  const byExam = new Map<string, Set<string>>();
  for (const entry of hidden) {
    const pair = splitExamSubjectHideKey(entry);
    if (!pair) continue;
    const set = byExam.get(pair.examType) ?? new Set<string>();
    set.add(pair.subject);
    byExam.set(pair.examType, set);
  }
  const out: Record<string, string[]> = {};
  for (const [examType, subjects] of byExam) {
    out[examType] = Array.from(subjects).sort();
  }
  return out;
}

/** Drop a subject from one exam type. Catalog name and other exams stay. */
export function hideSubjectOnExamType(
  hidden: string[],
  examType: string,
  subject: string
): string[] {
  const key = examTypeSubjectHideKey(examType, subject);
  const next = hidden
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean);
  if (!next.includes(key)) next.push(key);
  return Array.from(new Set(next));
}

/** Put a subject back on one exam type. */
export function restoreSubjectOnExamType(
  hidden: string[],
  examType: string,
  subject: string
): string[] {
  const key = examTypeSubjectHideKey(examType, subject);
  return hidden
    .map((n) => n.trim().toUpperCase())
    .filter((n) => n && n !== key);
}

/** Remove every per-exam entry for this subject, then hide the catalog name. */
export function hideSubjectEverywhere(hidden: string[], subject: string): string[] {
  const name = subject.trim().toUpperCase();
  const next = hidden
    .map((n) => n.trim().toUpperCase())
    .filter((n) => {
      if (!n || n === name) return false;
      const pair = splitExamSubjectHideKey(n);
      return !pair || pair.subject !== name;
    });
  next.push(name);
  return Array.from(new Set(next));
}

/** Keep per-exam removals attached to the new name when a catalog subject is renamed. */
export function rewriteHiddenOnRename(hidden: string[], from: string, to: string): string[] {
  const fromName = from.trim().toUpperCase();
  const toName = to.trim().toUpperCase();
  const next = hidden
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean)
    .map((n) => {
      const pair = splitExamSubjectHideKey(n);
      if (!pair) {
        if (n === fromName || n === toName) return "";
        return n;
      }
      if (pair.subject === fromName) return examTypeSubjectHideKey(pair.examType, toName);
      return n;
    })
    .filter(Boolean);
  next.push(fromName);
  return Array.from(new Set(next));
}
