"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TeacherRow, AuditRecord } from "./teacheraudit/types";
import TeacherAuditHeader from "./teacheraudit/TeacherAuditHeader";
import TeacherAuditCard from "./teacheraudit/TeacherAuditCard";

import TimellyLoader from "../common/TimellyLoader";
import {
  invalidateTeacherAuditTeachers,
  loadTeacherAuditRecords,
  loadTeacherAuditTeachers,
  peekTeacherAuditRecords,
  peekTeacherAuditTeachers,
  setTeacherAuditRecords,
} from "@/lib/loadSchoolAdminFastTabs";

function getCurrentAcademicYear() {
  const now = new Date();

  // Academic year starts in June (month index 5)
  const startYear =
    now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;

  return `${startYear}-${startYear + 1}`;
}

function getRecentAcademicYears() {
  const [start] = getCurrentAcademicYear().split("-").map(Number);
  return Array.from({ length: 4 }, (_, index) => {
    const year = start - index;
    const value = `${year}-${year + 1}`;
    return { value, label: value };
  });
}

export default function TeacherAuditTab() {
  const [q, setQ] = useState("");
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [academicYears, setAcademicYears] = useState(getRecentAcademicYears);
  const [loading, setLoading] = useState(true);
  const teacherRequestSeq = useRef(0);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(
    null
  );
  const [addFormMode, setAddFormMode] = useState<"good" | "bad">("good");
  const [historyExpanded, setHistoryExpanded] = useState<Record<string, boolean>>(
    {}
  );
  const [recordsByTeacher, setRecordsByTeacher] = useState<
    Record<string, AuditRecord[]>
  >({});
  const [category, setCategory] = useState<string>("");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [scoreImpact, setScoreImpact] = useState<number>(5);

  const [saving, setSaving] = useState(false);

  const fetchTeachers = useCallback(async (revalidate = false) => {
    const requestId = ++teacherRequestSeq.current;
    if (!revalidate) {
      const cached = peekTeacherAuditTeachers(q, academicYear);
      if (cached) {
        setTeachers(cached as TeacherRow[]);
        setLoading(false);
        void fetchTeachers(true);
        return;
      }
    }

    setLoading(teachers.length === 0);
    try {
      const rows = await loadTeacherAuditTeachers(q, academicYear, { revalidate });
      if (requestId !== teacherRequestSeq.current) return;
      setTeachers(rows as TeacherRow[]);
    } catch {
      if (requestId === teacherRequestSeq.current && teachers.length === 0) setTeachers([]);
    } finally {
      if (requestId === teacherRequestSeq.current) setLoading(false);
    }
  }, [academicYear, q, teachers.length]);

  useEffect(() => {
    const t = setTimeout(() => fetchTeachers(), 300);
    return () => clearTimeout(t);
  }, [q, academicYear, fetchTeachers]);

  const loadRecords = useCallback(async (teacherId: string, revalidate = false) => {
    if (!revalidate) {
      const cached = peekTeacherAuditRecords(teacherId, academicYear);
      if (cached) {
        setRecordsByTeacher((prev) => ({
          ...prev,
          [teacherId]: cached as AuditRecord[],
        }));
        void loadRecords(teacherId, true);
        return;
      }
    }

    try {
      const records = await loadTeacherAuditRecords(teacherId, academicYear, { revalidate });
      setRecordsByTeacher((prev) => ({
        ...prev,
        [teacherId]: records as AuditRecord[],
      }));
    } catch {
      setRecordsByTeacher((prev) => ({ ...prev, [teacherId]: [] }));
    }
  }, [academicYear]);

  const openAddForm = (t: TeacherRow, mode: "good" | "bad") => {
    setExpandedTeacherId(t.id);
    setAddFormMode(mode);
    setDescription("");
    setCustomCategory("");
    setCategory("");
    setScoreImpact(mode === "bad" ? -5 : 5);

    loadRecords(t.id);
  };

  const toggleHistory = (teacherId: string) => {
    setHistoryExpanded((prev) => ({ ...prev, [teacherId]: !prev[teacherId] }));
    if (!recordsByTeacher[teacherId]) loadRecords(teacherId);
  };

  const saveRecord = async () => {
    const teacherId = expandedTeacherId;
    if (!teacherId) return;

    setSaving(true);

    try {
      const payload = {
        category: category || "OTHER",
        customCategory: category ? null : customCategory.trim(),
        scoreImpact, // ✅ send raw impact
        academicYear,
        ...(description.trim() && { description: description.trim() }),
      };

      const res = await fetch(`/api/teacher-audit/${teacherId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save");

      if (data.record) {
        const nextRecords = [data.record as AuditRecord, ...(recordsByTeacher[teacherId] ?? [])];
        setRecordsByTeacher((prev) => ({ ...prev, [teacherId]: nextRecords }));
        setTeacherAuditRecords(teacherId, academicYear, nextRecords);
      }
      setTeachers((prev) =>
        prev.map((teacher) =>
          teacher.id === teacherId
            ? {
                ...teacher,
                performanceScore: Math.max(0, Math.min(100, teacher.performanceScore + scoreImpact)),
                recordCount: teacher.recordCount + 1,
              }
            : teacher
        )
      );
      invalidateTeacherAuditTeachers();
      void loadRecords(teacherId, true);
      void fetchTeachers(true);

      setDescription("");
      setCustomCategory("");
      setCategory("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };




  return (
    <div className="space-y-4 sm:space-y-6 px-3 md:px-0 overflow-x-hidden">
      <TeacherAuditHeader
        searchValue={q}
        onSearchChange={setQ}
        academicYear={academicYear}
        onAcademicYearChange={setAcademicYear}
        academicYears={academicYears}
        onAddAcademicYear={(newYear) =>
          setAcademicYears((prev) => {
            if (prev.some((y) => y.value === newYear)) return prev;
            const next = [{ value: newYear, label: newYear }, ...prev];
            return next.sort((a, b) => parseInt(b.value.slice(0, 4), 10) - parseInt(a.value.slice(0, 4), 10));
          })
        }
        recordCount={teachers.reduce((sum, teacher) => sum + teacher.recordCount, 0)}
        onSearchSubmit={() => { }}
        placeholder="Search teacher..."
      />

      <div className="">
        <div className=" mx-auto space-y-4 sm:space-y-6">


          {loading && teachers.length === 0 ? (
            <TimellyLoader
              title="Loading teacher audit"
              steps={["Teachers", "Scores", "Audit history"]}
            />
          ) : (
            <div className="space-y-4">
              {loading && (
                <div className="text-xs text-white/50">Refreshing teacher audit data...</div>
              )}
              {teachers.length === 0 ? (
                <div className="rounded-2xl border  border-white/10 backdrop-blur-xl p-6 sm:p-8 text-center text-white/60 text-sm sm:text-base">
                  No teachers found. Try a different search.
                </div>
              ) : (
                teachers.map((t) => (
                  <TeacherAuditCard
                    key={t.id}
                    teacher={t}
                    isAddFormOpen={expandedTeacherId === t.id}
                    addFormMode={addFormMode}
                    records={recordsByTeacher[t.id] ?? []}
                    isHistoryOpen={!!historyExpanded[t.id]}
                    category={category}
                    customCategory={customCategory}
                    description={description}
                    scoreImpact={scoreImpact}
                    saving={saving}
                    onCategoryChange={setCategory}
                    onCustomCategoryChange={setCustomCategory}
                    onDescriptionChange={setDescription}
                    onScoreImpactChange={setScoreImpact}
                    onOpenAddGood={() => openAddForm(t, "good")}
                    onOpenAddBad={() => openAddForm(t, "bad")}
                    onToggleHistory={() => toggleHistory(t.id)}
                    onSaveRecord={saveRecord}
                    onCloseAddForm={() => setExpandedTeacherId(null)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
