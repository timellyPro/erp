import { useState, useEffect } from "react";
import { normalizeExamTypes } from "@/lib/exams/examTypes";

interface ClassItem {
  id: string;
  name: string;
  section: string | null;
}

export function useScheduleExamState({
  mode = "create",
  examId,
  onSave,
}: {
  mode?: "create" | "edit";
  examId?: string;
  onSave?: () => void;
}) {
  const [units, setUnits] = useState<Array<{ id: number; unitId?: string; name: string; status: string; completion: number }>>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [examDate, setExamDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(180);
  const [examStatus, setExamStatus] = useState<"UPCOMING" | "COMPLETED">("UPCOMING");
  const [examTitle, setExamTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editTermId, setEditTermId] = useState<string | null>(null);
  const [examLoading, setExamLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClassLoading(true);
      try {
        const res = await fetch("/api/class/list", { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.classes && Array.isArray(data.classes)) {
          setClasses(data.classes);
          if (data.classes.length > 0 && !selectedClassId) {
            setSelectedClassId((prev) => prev || data.classes[0].id);
          }
        }
      } finally {
        if (!cancelled) setClassLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; selectedClassId is only read to avoid overriding an existing selection
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exam-types", { cache: "no-store", credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.examTypes)) {
          const options = normalizeExamTypes(data.examTypes).map((t) => t.name);
          setExamTypeOptions(options);
        }
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const subjectsRes = await fetch("/api/exam-subjects", {
          cache: "no-store",
          credentials: "include",
        });
        if (subjectsRes.ok) {
          const subjectsData = await subjectsRes.json();
          if (!cancelled && Array.isArray(subjectsData.subjects)) {
            const listedSubjects = subjectsData.subjects
              .map((name: string) => name?.trim())
              .filter((name: string) => Boolean(name));
            setSubjectOptions((prev) => Array.from(new Set([...listedSubjects, ...prev])));
          }
        }

        const params = new URLSearchParams();
        if (selectedClassId) params.set("classId", selectedClassId);
        const res = await fetch(`/api/exams/terms?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const exams = Array.isArray(data.exams) ? data.exams : [];
        const subjects: string[] = Array.from(
          new Set<string>(
            exams
              .map((exam: { subject?: string }) => exam.subject?.trim())
              .filter((name: string | undefined): name is string => Boolean(name))
          )
        );
        const names: string[] = Array.from(
          new Set<string>(
            exams
              .map((exam: { name?: string }) => exam.name?.trim())
              .filter((name: string | undefined): name is string => Boolean(name))
          )
        );
        setSubjectOptions((prev) => Array.from(new Set([...subjects, ...prev])));
        setExamTypeOptions((prev) => Array.from(new Set([...names, ...prev])));
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  useEffect(() => {
    if (mode !== "edit" || !examId) return;
    let cancelled = false;
    setExamLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/exams/schedules/${examId}`, { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.exam) {
          const ex = data.exam;
          setExamTitle(ex.name ?? "");
          setSubject(ex.subject ?? "");
          setExamStatus((ex.status === "COMPLETED" ? "COMPLETED" : "UPCOMING") as "UPCOMING" | "COMPLETED");
          setExamDate(ex.date ?? today);
          setStartTime(ex.time?.slice(0, 5) ?? "09:00");
          setDurationMin(ex.durationMin ?? 180);
          setSelectedClassId(ex.classId ?? ex.class?.id ?? "");
          setEditTermId(ex.termId ?? null);
          const syllabus = ex.syllabus ?? [];
          setUnits(
            syllabus.length > 0
              ? syllabus.map((u: { id?: string; subject?: string; completedPercent?: number }, i: number) => ({
                id: i + 1,
                unitId: u.id,
                name: u.subject ?? "",
                status: (u.completedPercent ?? 0) === 100 ? "Completed" : (u.completedPercent ?? 0) > 0 ? "Partial" : "Pending",
                completion: u.completedPercent ?? 0,
              }))
              : []
          );
        }
      } finally {
        if (!cancelled) setExamLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, examId, today]);

  const addUnit = () => setUnits([...units, { id: units.length ? Math.max(...units.map((u) => u.id), 0) + 1 : 1, name: "", status: "Pending", completion: 0 }]);
  const removeUnit = (id: number) => setUnits(units.filter(u => u.id !== id));

  const isEdit = mode === "edit";

  async function saveSyllabusUnits(termId: string, subj: string) {
    const opts = { credentials: "include" as const, headers: { "Content-Type": "application/json" } };
    await fetch(`/api/exams/terms/${termId}/syllabus`, {
      method: "POST",
      ...opts,
      body: JSON.stringify({ subject: subj }),
    });
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const unitName = (u.name || "").trim() || "Unit " + (i + 1);
      await fetch(`/api/exams/terms/${termId}/syllabus/units`, {
        method: "POST",
        ...opts,
        body: JSON.stringify({
          subject: subj,
          unitName,
          order: i,
          completedPercent: u.completion,
        }),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const title = examTitle.trim();
    const subj = subject.trim();
    if (!title) {
      setSubmitError("Exam title is required.");
      return;
    }
    if (!selectedClassId) {
      setSubmitError("Please select a class.");
      return;
    }
    if (!subj) {
      setSubmitError("Subject is required.");
      return;
    }
    const duration = durationMin > 0 ? durationMin : 60;
    setSubmitLoading(true);
    try {
      if (isEdit && editTermId && examId) {
        const termRes = await fetch(`/api/exams/terms/${editTermId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: title, status: examStatus }),
        });
        const termData = await termRes.json();
        if (!termRes.ok) throw new Error(termData.message || "Failed to update exam term");

        const scheduleRes = await fetch(`/api/exams/schedules/${examId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subject: subj,
            examDate,
            startTime,
            durationMin: duration,
          }),
        });
        const scheduleData = await scheduleRes.json();
        if (!scheduleRes.ok) throw new Error(scheduleData.message || "Failed to update schedule");

        for (const u of units) {
          if (u.unitId) {
            await fetch(`/api/exams/units/${u.unitId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ completedPercent: u.completion }),
            });
          }
        }
        const newUnits = units.filter((u) => !u.unitId && (u.name?.trim() || u.completion > 0));
        if (newUnits.length > 0) {
          const opts = { credentials: "include" as const, headers: { "Content-Type": "application/json" } };
          await fetch(`/api/exams/terms/${editTermId}/syllabus`, {
            method: "POST",
            ...opts,
            body: JSON.stringify({ subject: subj }),
          });
          await Promise.all(
            newUnits.map((u, idx) =>
              fetch(`/api/exams/terms/${editTermId}/syllabus/units`, {
                method: "POST",
                ...opts,
                body: JSON.stringify({
                  subject: subj,
                  unitName: (u.name || "").trim() || "Unit " + (idx + 1),
                  order: units.indexOf(u),
                  completedPercent: u.completion,
                }),
              })
            )
          );
        }
        onSave?.();
        return;
      }

      const termRes = await fetch("/api/exams/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: title,
          classId: selectedClassId,
          status: examStatus,
        }),
      });
      const termData = await termRes.json();
      if (!termRes.ok) {
        throw new Error(termData.message || "Failed to create exam term");
      }
      const termId = termData.term?.id;
      if (!termId) {
        throw new Error("Invalid response from server");
      }
      const scheduleRes = await fetch(`/api/exams/terms/${termId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: subj,
          examDate: examDate,
          startTime: startTime,
          durationMin: duration,
        }),
      });
      const scheduleData = await scheduleRes.json();
      if (!scheduleRes.ok) {
        throw new Error(scheduleData.message || "Failed to add exam schedule");
      }
      if (units.length > 0) {
        await saveSyllabusUnits(termId, subj);
      }
      onSave?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return {
    units,
    setUnits,
    classes,
    examTypeOptions,
    subjectOptions,
    classLoading,
    selectedClassId,
    setSelectedClassId,
    examDate,
    setExamDate,
    startTime,
    setStartTime,
    durationMin,
    setDurationMin,
    examStatus,
    setExamStatus,
    examTitle,
    setExamTitle,
    subject,
    setSubject,
    submitLoading,
    submitError,
    examLoading,
    addUnit,
    removeUnit,
    isEdit,
    handleSubmit,
  };
}
