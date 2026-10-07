"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  selected: string[];
  classId?: string;
  onChange: (subjects: string[]) => void;
  error?: string;
};

function uniqueSubjects(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const key = s.replace(/\s+/g, " ").toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export default function StudentSubjectsMultiSelect({
  selected,
  classId,
  onChange,
  error,
}: Props) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsRes, termsRes] = await Promise.all([
        fetch("/api/exam-subjects", { credentials: "include", cache: "no-store" }).catch(() => null),
        classId
          ? fetch(`/api/exams/terms?classId=${encodeURIComponent(classId)}`, {
              credentials: "include",
              cache: "no-store",
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const names: string[] = [];

      if (subjectsRes?.ok) {
        const data = await subjectsRes.json().catch(() => ({}));
        const subjects = Array.isArray(data.subjects) ? data.subjects : [];
        subjects.forEach((s: string) => {
          if (s?.trim()) names.push(s.trim());
        });
      }

      if (termsRes?.ok) {
        const data = await termsRes.json().catch(() => ({}));
        // Teacher shape: { exams: [{ subject }] }
        const exams = Array.isArray(data.exams) ? data.exams : [];
        exams.forEach((exam: { subject?: string }) => {
          if (exam.subject?.trim()) names.push(exam.subject.trim());
        });
        // School admin shape: { terms: [{ schedules, syllabus }] }
        const terms = Array.isArray(data.terms) ? data.terms : [];
        terms.forEach(
          (term: {
            schedules?: { subject?: string }[];
            syllabus?: { subject?: string }[];
          }) => {
            (term.schedules || []).forEach((row) => {
              if (row.subject?.trim()) names.push(row.subject.trim());
            });
            (term.syllabus || []).forEach((row) => {
              if (row.subject?.trim()) names.push(row.subject.trim());
            });
          }
        );
      }

      setOptions(uniqueSubjects(names));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const available = useMemo(() => {
    const selectedKeys = new Set(
      selected.map((s) => s.replace(/\s+/g, " ").toUpperCase())
    );
    return options.filter((o) => !selectedKeys.has(o.replace(/\s+/g, " ").toUpperCase()));
  }, [options, selected]);

  const addSubject = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const key = v.replace(/\s+/g, " ").toUpperCase();
    if (selected.some((s) => s.replace(/\s+/g, " ").toUpperCase() === key)) return;
    onChange([...selected, v]);
    setPick("");
  };

  return (
    <div className="md:col-span-2 xl:col-span-3">
      <label className="block text-xs font-medium text-white/70 mb-1.5">
        Subjects
      </label>
      <p className="text-[11px] text-white/45 mb-2">
        From exam &amp; syllabus catalog. Select the subjects this student takes.
      </p>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[28px]">
        {selected.length === 0 ? (
          <span className="text-xs text-white/40">No subjects selected</span>
        ) : (
          selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-lime-400/20 border border-lime-400/30 text-lime-300 text-sm"
            >
              {s}
              <button
                type="button"
                onClick={() =>
                  onChange(selected.filter((x) => x !== s))
                }
                className="hover:text-white"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <select
          value={pick}
          disabled={loading || available.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (v) addSubject(v);
          }}
          className="flex-1 pl-4 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-lime-400/50 text-gray-300 text-sm disabled:opacity-50"
        >
          <option value="">
            {loading
              ? "Loading subjects…"
              : available.length === 0
                ? "No more subjects to add"
                : "Select subject to add"}
          </option>
          {available.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-xs text-red-400 mt-1.5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
