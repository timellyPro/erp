"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { SelectField } from "./MarksSelectField";
import { Save, ClipboardList, PenLine, Download } from "lucide-react";
import DataTable from "../../common/TableLayout";
import { Column } from "@/app/frontend/types/superadmin";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
  type LiteClassOption,
} from "@/lib/loadTeacherFastTabs";

const TeacherReportCard = lazy(() => import("./ReportCard"));
const TeacherDownloadReports = lazy(() => import("./DownloadReports"));

/* ---------------- TYPES ---------------- */

type StudentRow = {
  id: string;
  rollNo: string;
  name: string;
  avatar: string;
  marks: number | "" | "AB";
  maxMarks: number | "";
  markId?: string;
};

type ClassOption = { id: string; name: string; section: string | null };
type StudentApi = {
  id: string;
  rollNo: string | null;
  user: { id: string; name: string | null; email: string | null; photoUrl?: string | null };
  class?: { id: string; name: string; section: string | null };
};
type MarkApi = {
  id: string;
  studentId: string;
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType?: string | null;
  createdAt: string;
};

const DEFAULT_EXAM_TYPES = ["TERM 1", "TERM 2", "FINAL"];

function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
}

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

export default function TeacherMarksTab() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<"entry" | "report-card" | "download">("entry");
  const initialClasses = peekTeacherMarksClasses();
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [examTypeOptions, setExamTypeOptions] =
    useState<string[]>(DEFAULT_EXAM_TYPES);
  const [form, setForm] = useState<{
    classId: string;
    classLabel: string;
    section: string;
    subject: string;
    examType: string;
    maxMarks: number | "";
  }>(() => {
    const first = initialClasses?.[0];
    return {
      classId: first?.id ?? "",
      classLabel: first
        ? first.section
          ? `${first.name} - ${first.section}`
          : first.name
        : "",
      section: first?.section || "Section A",
      subject: "",
      examType: "TERM 1",
      maxMarks: 100,
    };
  });
  const [activeBtn, setActiveBtn] = useState<null | "save" | "import" | "export">(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [editingMaxId, setEditingMaxId] = useState<string | null>(null);
  const [editingMaxValue, setEditingMaxValue] = useState("");
  const userSelectedClassRef = useRef(false);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));
  const sectionOptions = form.classId
    ? (() => {
        const c = classes.find((x) => x.id === form.classId);
        if (c?.section) return [c.section];
        return ["Section A"];
      })()
    : ["Section A"];
  const fetchClasses = useCallback(async () => {
    const cached = peekTeacherMarksClasses();
    if (cached?.length) {
      setClasses(mapLiteClasses(cached));
      setClassesLoading(false);
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        if (prev.classId) return prev;
        const first = cached[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } else {
      setClassesLoading(true);
    }

    try {
      const list = await loadTeacherMarksClasses({ revalidate: true });
      setClasses(mapLiteClasses(list));
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        const stillValid = list.some((c) => c.id === prev.classId);
        if (stillValid) return prev;
        if (list.length === 0) {
          return { ...prev, classId: "", classLabel: "", section: "" };
        }
        const first = list[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } catch {
      if (!peekTeacherMarksClasses()?.length) setClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }, []);

  const fetchStudentsAndMarks = useCallback(async () => {
    if (!form.classId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId: form.classId,
        subject: form.subject,
      });
      if (form.examType) {
        params.append("examType", form.examType);
      }

      const [studentsRes, marksRes] = await Promise.all([
        fetch(`/api/class/students?classId=${encodeURIComponent(form.classId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/marks/view?${params.toString()}`, {
          cache: "no-store",
        }),
      ]);
      const studentsData = await studentsRes.json();
      const marksData = await marksRes.json();
      const students: StudentApi[] = Array.isArray(studentsData.students) ? studentsData.students : [];
      const marks: MarkApi[] = Array.isArray(marksData.marks) ? marksData.marks : [];
      const markByStudent: Record<string, MarkApi> = {};
      for (const m of marks) {
        const existing = markByStudent[m.studentId];
        if (!existing || m.createdAt > existing.createdAt) {
          markByStudent[m.studentId] = m;
        }
      }

      // Restore max marks from what was previously saved (not the UI default of 100)
      const savedMarksList = Object.values(markByStudent).sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );
      const latestTotal = savedMarksList.find(
        (m) => typeof m.totalMarks === "number" && m.totalMarks > 0
      )?.totalMarks;
      const defaultMax =
        latestTotal ?? (typeof form.maxMarks === "number" && form.maxMarks > 0 ? form.maxMarks : 100);
      if (latestTotal) {
        setForm((prev) =>
          prev.maxMarks === defaultMax ? prev : { ...prev, maxMarks: defaultMax }
        );
      }

      const newRows: StudentRow[] = students
        .map((s) => {
          const name = s.user?.name ?? "Student";
          const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=40&background=4ade80&color=fff`;
          const mark = markByStudent[s.id];
          const isAbsent = mark?.grade === "AB";
          const rowMax =
            mark && typeof mark.totalMarks === "number" && mark.totalMarks > 0
              ? mark.totalMarks
              : defaultMax;
          return {
            id: s.id,
            rollNo: s.rollNo ?? "--",
            name,
            avatar: s.user?.photoUrl?.trim() || fallbackAvatar,
            marks: mark ? (isAbsent ? ("AB" as const) : Number(mark.marks)) : ("" as const),
            maxMarks: rowMax,
            markId: mark?.id,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setRows(newRows);
      setEditingMaxId(null);
      setSaveMessage("");
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [form.classId, form.subject, form.examType]);

  const fetchMetadata = useCallback(async (classId: string) => {
    setSubjectsLoading(true);
    try {
      const [examTypesRes, meRes, termsRes] = await Promise.all([
        fetch("/api/exam-types", { cache: "no-store" }).catch(() => null),
        fetch("/api/user/me", { cache: "no-store", credentials: "include" }).catch(() => null),
        fetch(`/api/exams/terms?${classId ? `classId=${classId}` : ""}`, {
          cache: "no-store",
          credentials: "include",
        }).catch(() => null),
      ]);

      const allExamNames = new Set<string>();

      if (examTypesRes?.ok) {
        const data = await examTypesRes.json().catch(() => ({}));
        const names: string[] = Array.isArray(data.examTypes) ? data.examTypes : [];
        names.forEach((n) => allExamNames.add(n));
      }

      if (termsRes?.ok) {
        const data = await termsRes.json().catch(() => ({}));
        const exams = Array.isArray(data.exams) ? data.exams : [];
        exams.forEach((exam: { name?: string }) => {
          if (exam.name?.trim()) allExamNames.add(exam.name.trim().toUpperCase());
        });
      }

      if (allExamNames.size > 0) {
        setExamTypeOptions((prev) => Array.from(new Set([...allExamNames, ...prev])));
        setForm((prev) =>
          allExamNames.has(prev.examType) ? prev : { ...prev, examType: Array.from(allExamNames)[0] }
        );
      }

      let teacherSubjects: string[] = [];
      if (meRes?.ok) {
        const data = await meRes.json().catch(() => ({}));
        const user = data?.user;
        const fromList = Array.isArray(user?.subjects) ? user.subjects : [];
        const primary = typeof user?.subject === "string" ? user.subject : "";
        teacherSubjects = uniqueSubjects([...fromList, primary].filter(Boolean));
      }

      setSubjectOptions(teacherSubjects);
      setForm((prev) => {
        if (teacherSubjects.length === 0) {
          return { ...prev, subject: "" };
        }
        const match = teacherSubjects.find(
          (s) => s.replace(/\s+/g, " ").toUpperCase() === prev.subject.replace(/\s+/g, " ").toUpperCase()
        );
        return match ? { ...prev, subject: match } : { ...prev, subject: teacherSubjects[0] };
      });
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
    fetchMetadata(initialClasses?.[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [fetchStudentsAndMarks]);

  const handleChange = (key: string, value: string) => {
    if (key === "class") {
      if (!value || value === "Select class") {
        userSelectedClassRef.current = false;
        setForm((prev) => ({ ...prev, classId: "", classLabel: "", section: "" }));
        return;
      }
      userSelectedClassRef.current = true;
      const opt = classOptions.find((o) => o.value === value || o.label === value);
      const c = classes.find((x) => x.id === value || (x.section ? `${x.name} - ${x.section}` : x.name) === value);
      setForm((prev) => ({
        ...prev,
        classId: opt?.value ?? "",
        classLabel: opt?.label ?? value,
        section: c?.section ?? prev.section,
      }));
      return;
    }
    if (key === "section") {
      setForm((prev) => ({ ...prev, section: value }));
      return;
    }
    if (key === "examType") {
      setForm((prev) => ({ ...prev, examType: value.toUpperCase() }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateMarks = (id: string, value: string) => {
    const num = value === "" ? "" : Math.min(1000, Math.max(0, Number(value)));
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, marks: num } : r)));
  };

  const toggleAbsent = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, marks: r.marks === "AB" ? "" : ("AB" as const) }
          : r
      )
    );
  };

  const updateMaxMarks = (value: string) => {
    // Allow fully clearing the field — applies to all students
    if (value.trim() === "") {
      setForm((prev) => ({ ...prev, maxMarks: "" }));
      setRows((prev) => prev.map((r) => ({ ...r, maxMarks: "" as const })));
      setEditingMaxId(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setForm((prev) => ({ ...prev, maxMarks: num }));
    setRows((prev) =>
      prev.map((r) => {
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setEditingMaxId(null);
  };

  const updateRowMaxMarks = (id: string, value: string) => {
    if (value.trim() === "") {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, maxMarks: "" as const } : r)));
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setForm((prev) => ({ ...prev, maxMarks: num }));
  };

  const startEditMaxMarks = (id: string, current: number | "") => {
    setEditingMaxId(id);
    setEditingMaxValue(current === "" ? "" : String(current));
  };

  const commitEditMaxMarks = (id: string) => {
    updateRowMaxMarks(id, editingMaxValue);
    setEditingMaxId(null);
    setEditingMaxValue("");
  };

  const getPercentage = (m: number | "" | "AB", max: number | "") =>
    m === "" || max === "" || max <= 0
      ? "--"
      : m === "AB"
        ? "Absent"
        : `${((Number(m) / max) * 100).toFixed(1)}%`;

  const getGrade = (m: number | "" | "AB", max: number | "") => {
    if (m === "AB") return "AB";
    if (m === "" || max === "" || max <= 0) return "--";
    const pct = (Number(m) / max) * 100;
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    return "C";
  };

  const total = rows.length;
  const entered = rows.filter((r) => r.marks !== "").length;
  const absentCount = rows.filter((r) => r.marks === "AB").length;
  const pending = total - entered;

  const handleSaveAll = async () => {
    if (!form.classId || !form.subject || form.subject === "No subjects assigned") return;
    const filledRows = rows.filter((r) => r.marks !== "");
    if (filledRows.length === 0) return;
    const missingMax = filledRows.some(
      (r) => r.maxMarks === "" || typeof r.maxMarks !== "number" || r.maxMarks <= 0
    );
    if (missingMax) {
      setSaveMessage("Set max marks before saving (cannot be empty).");
      return;
    }
    setSaveLoading(true);
    setSaveMessage("");
    try {
      const editableRows = rows.filter((row) => row.marks !== "");
      const results = await Promise.all(
        editableRows.map(async (row) => {
          const isAbsent = row.marks === "AB";
          const totalMarks = row.maxMarks as number;
          const payload = {
            studentId: row.id,
            classId: form.classId,
            subject: form.subject,
            marks: isAbsent ? 0 : Number(row.marks),
            totalMarks,
            examType: form.examType || null,
            ...(isAbsent ? { grade: "AB" } : {}),
          };

          const res = row.markId
            ? await fetch(`/api/marks/${row.markId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  marks: payload.marks,
                  totalMarks: payload.totalMarks,
                  examType: payload.examType,
                  ...(isAbsent ? { grade: "AB" } : {}),
                }),
              })
            : await fetch("/api/marks/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

          const data = await res.json().catch(() => null);
          return {
            rowId: row.id,
            ok: res.ok,
            mark: data?.mark as MarkApi | undefined,
            message: data?.message as string | undefined,
          };
        })
      );

      const successMap = new Map(
        results
          .filter((result) => result.ok && result.mark)
          .map((result) => [result.rowId, result.mark as MarkApi])
      );

      if (successMap.size > 0) {
        setRows((prev) =>
          prev.map((row) => {
            const savedMark = successMap.get(row.id);
            if (!savedMark) return row;
            return {
              ...row,
              marks: savedMark.marks,
              maxMarks: savedMark.totalMarks,
              markId: savedMark.id,
            };
          })
        );
      }

      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        setSaveMessage(
          failed[0]?.message || `${failed.length} mark entr${failed.length > 1 ? "ies" : "y"} failed to save.`
        );
      } else {
        setSaveMessage("Marks updated successfully.");
      }

      await fetchStudentsAndMarks();
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const columns: Column<StudentRow>[] = [
    { header: "ROLL NO", accessor: "rollNo" },
    {
      header: "STUDENT NAME",
      render: (row: StudentRow) => (
        <div className="flex items-center gap-3">
          <img src={row.avatar} alt={row.name} className="w-9 h-9 rounded-full" />
          <span className="font-medium text-white">{row.name}</span>
        </div>
      ),
    },
    {
      header: "MARKS OBTAINED",
      align: "center",
      render: (row: StudentRow) => (
        <div className="flex items-center justify-center gap-1.5">
          {row.marks === "AB" ? (
            <span className="w-20 text-center text-red-400 font-semibold text-sm">Absent</span>
          ) : (
            <input
              type="number"
              value={row.marks}
              onChange={(e) => updateMarks(row.id, e.target.value)}
              className="w-20 text-center rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white outline-none"
            />
          )}
          <button
            type="button"
            onClick={() => toggleAbsent(row.id)}
            title={row.marks === "AB" ? "Remove absent" : "Mark as absent"}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
              row.marks === "AB"
                ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white/60"
            }`}
          >
            AB
          </button>
        </div>
      ),
    },
    { header: "MAX MARKS", align: "center", render: (row: StudentRow) => (
        editingMaxId === row.id ? (
          <input
            type="number"
            autoFocus
            min={1}
            max={1000}
            value={editingMaxValue}
            onChange={(e) => setEditingMaxValue(e.target.value)}
            onBlur={() => commitEditMaxMarks(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEditMaxMarks(row.id);
              }
              if (e.key === "Escape") {
                setEditingMaxId(null);
                setEditingMaxValue("");
              }
            }}
            className="w-20 text-center rounded-lg bg-white/10 border border-lime-400/50 px-2 py-1 text-white outline-none focus:ring-1 focus:ring-lime-400/50"
          />
        ) : (
          <button
            type="button"
            title="Double-click to edit max marks"
            onDoubleClick={() => startEditMaxMarks(row.id, row.maxMarks)}
            className="min-w-16 px-3 py-1 rounded-lg text-white font-medium hover:bg-white/10 border border-transparent hover:border-white/10 transition cursor-text"
          >
            {row.maxMarks === "" ? "—" : row.maxMarks}
          </button>
        )
      ) },
    {
      header: "PERCENTAGE",
      align: "center",
      render: (row: StudentRow) => (
        <span className="font-medium text-white">{getPercentage(row.marks, row.maxMarks)}</span>
      ),
    },
    {
      header: "GRADE",
      align: "center",
      render: (row: StudentRow) => {
        const g = getGrade(row.marks, row.maxMarks);
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs border ${
              g === "AB"
                ? "bg-red-500/10 text-red-400 border-red-500/30"
                : g === "A+"
                  ? "bg-lime-400/10 text-lime-400 border-lime-400/30"
                  : "bg-white/5 text-gray-200 border-white/20"
            }`}
          >
            {g === "AB" ? "Absent" : g}
          </span>
        );
      },
    },
  ];

  const displayClass = form.classLabel || form.classId || "Select class";
  const displaySection = form.section || "Section A";

  return (
    <div className="min-h-screen text-white px-3 sm:px-6 lg:px-8 py-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={subTab === "entry" ? "Marks Entry" : subTab === "report-card" ? "Report Card" : "Download Reports"}
          subtitle={subTab === "entry" ? "Enter and manage student marks for your classes" : subTab === "report-card" ? "View and download student report cards" : "Download marks reports for classes as Excel or PDF"}
        />

        {/* SUB-TAB TOGGLE */}
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab("entry")}
            className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "entry"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <PenLine size={15} />
            Marks Entry
          </button>
          <button
            onClick={() => setSubTab("report-card")}
            className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "report-card"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <ClipboardList size={15} />
            Report Card
          </button>
          <button
            onClick={() => setSubTab("download")}
            className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "download"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Download size={15} />
            Download Reports
          </button>
        </div>

        {subTab === "report-card" ? (
          <Suspense fallback={<div className="flex justify-center py-16"><div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" /></div>}>
            <TeacherReportCard />
          </Suspense>
        ) : subTab === "download" ? (
          <Suspense fallback={<div className="flex justify-center py-16"><div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" /></div>}>
            <TeacherDownloadReports />
          </Suspense>
        ) : (
        <>

        {classesLoading && classes.length === 0 && (
          <TimellyLoader title="Loading classes" steps={["Classes", "Subjects", "Marks"]} />
        )}

        {/* FILTER BAR */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
          {!subjectsLoading && subjectOptions.length === 0 && (
            <p className="mb-4 text-sm text-amber-300/90">
              No subjects assigned — contact admin to assign subjects on your teacher profile.
            </p>
          )}
          {!classesLoading && classes.length === 0 && (
            <p className="mb-4 text-sm text-amber-300/90">
              No classes assigned — contact admin to assign classes on your teacher profile.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SelectField
              label="CLASS"
              value={form.classLabel || ""}
              onChange={(v) => handleChange("class", v)}
              options={classOptions.length ? classOptions.map((o) => o.label) : ["Select class"]}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="SECTION"
              value={form.section}
              onChange={(v) => handleChange("section", v)}
              options={sectionOptions}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="SUBJECT"
              value={form.subject}
              onChange={(v) => handleChange("subject", v)}
              options={subjectOptions.length ? subjectOptions : ["No subjects assigned"]}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="EXAM TYPE"
              value={form.examType}
              onChange={(v) => handleChange("examType", v)}
              options={examTypeOptions}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">MAX MARKS</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.maxMarks}
                placeholder="Clear to reset all"
                onChange={(e) => updateMaxMarks(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
              />
              <p className="mt-1 text-[10px] text-white/40">Clear this field to clear max marks for all students</p>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-4">
          {[
            { key: "save", label: "Save Marks", icon: Save },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.key}
                onClick={() => setActiveBtn(btn.key as "save" | "import" | "export")}
                className={`px-6 py-3 rounded-2xl flex items-center gap-2 text-sm font-medium transition
                  ${
                    activeBtn === btn.key
                      ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                      : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                  }`}
              >
                <Icon size={16} />
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* TABLE CARD */}
        <div className="glass-card rounded-2xl overflow-hidden border border-white/10 flex flex-col">
          <div className="p-6 border-b border-white/10 bg-white/[0.02]">
            <h3 className="font-bold text-white text-lg">Enter Marks</h3>
            <div className="flex items-center gap-2 mt-2 text-sm text-white/60">
              <span>{displayClass}</span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>{form.subject}</span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span className="text-lime-400 font-medium">{form.examType}</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable<StudentRow>
                  columns={columns}
                  rounded={false}
                  data={rows}
                  rowKey={(row) => row.id}
                  emptyText="No students in this class. Select a class above."
                />
              </div>

              <div className="md:hidden space-y-4 p-4">
                {rows.length === 0 ? (
                  <p className="text-white/60 text-center py-6">No students in this class.</p>
                ) : (
                  rows.map((student) => {
                    const percentage = getPercentage(student.marks, student.maxMarks);
                    const grade = getGrade(student.marks, student.maxMarks);
                    return (
                      <div
                        key={student.id}
                        className="rounded-2xl p-5 border border-white/10 bg-gradient-to-br from-purple-700/40 via-indigo-700/30 to-purple-900/40 backdrop-blur-xl shadow-xl"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <img src={student.avatar} alt={student.name} className="w-12 h-12 rounded-full flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-white font-semibold truncate">{student.name}</div>
                              <div className="text-xs text-white/60">Roll: {student.rollNo}</div>
                            </div>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs border bg-lime-400/20 text-lime-400 border-lime-400/40 flex-shrink-0">
                            {grade}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-4">
                            <label className="text-xs text-white/60 shrink-0">Marks Obtained</label>
                            <div className="flex items-center gap-2">
                              {student.marks === "AB" ? (
                                <span className="w-24 text-center text-red-400 font-semibold text-sm py-2">Absent</span>
                              ) : (
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={student.maxMarks === "" ? undefined : student.maxMarks}
                                  value={student.marks === "" ? "" : student.marks}
                                  onChange={(e) => updateMarks(student.id, e.target.value)}
                                  className="w-24 text-center rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white text-sm outline-none focus:border-lime-400/50"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => toggleAbsent(student.id)}
                                className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition ${
                                  student.marks === "AB"
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : "bg-white/5 text-white/40 border-white/10"
                                }`}
                              >
                                AB
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between text-sm items-center gap-3">
                            <span className="text-white/60 shrink-0">Max</span>
                            {editingMaxId === student.id ? (
                              <input
                                type="number"
                                autoFocus
                                min={1}
                                max={1000}
                                value={editingMaxValue}
                                onChange={(e) => setEditingMaxValue(e.target.value)}
                                onBlur={() => commitEditMaxMarks(student.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEditMaxMarks(student.id);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingMaxId(null);
                                    setEditingMaxValue("");
                                  }
                                }}
                                className="w-24 text-center rounded-lg bg-white/10 border border-lime-400/50 px-3 py-2 text-white text-sm outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                title="Double-tap to edit max marks"
                                onDoubleClick={() => startEditMaxMarks(student.id, student.maxMarks)}
                                className="text-white font-semibold px-2 py-1 rounded-lg hover:bg-white/10"
                              >
                                {student.maxMarks === "" ? "—" : student.maxMarks}
                              </button>
                            )}
                            <span className="text-white font-semibold ml-auto">{percentage}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white/[0.02] border-t border-white/10">
                <div className="flex gap-6 text-sm">
                  <span className="text-gray-400">
                    TOTAL <span className="text-white font-semibold ml-1">{total}</span>
                  </span>
                  <span className="text-lime-400">
                    ENTERED <span className="font-semibold ml-1">{entered}</span>
                  </span>
                  {absentCount > 0 && (
                    <span className="text-red-400">
                      ABSENT <span className="font-semibold ml-1">{absentCount}</span>
                    </span>
                  )}
                  <span className="text-red-400">
                    PENDING <span className="font-semibold ml-1">{pending}</span>
                  </span>
                </div>
                {saveMessage ? (
                  <span className="text-sm text-white/70">{saveMessage}</span>
                ) : null}
                <button
                  disabled={saveLoading || entered === 0}
                  onClick={handleSaveAll}
                  className={`px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition
                    ${
                      !saveLoading && entered > 0
                        ? "bg-lime-400/20 text-lime-400 border border-lime-400/30 hover:shadow-[0_0_15px_rgba(163,230,53,0.2)]"
                        : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                    }`}
                >
                  <Save size={16} />
                  {saveLoading ? "Saving…" : pending > 0 ? `Save ${entered} of ${total}` : "Save All Marks"}
                </button>
              </div>
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
