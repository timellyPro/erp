"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { SelectField } from "./MarksSelectField";
import { Save } from "lucide-react";
import DataTable from "../../common/TableLayout";
import { Column } from "@/app/frontend/types/superadmin";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
  type LiteClassOption,
} from "@/lib/loadTeacherFastTabs";

/* ---------------- TYPES ---------------- */

type StudentRow = {
  id: string;
  rollNo: string;
  name: string;
  avatar: string;
  marks: number | "";
  maxMarks: number;
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

const DEFAULT_SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "Hindi",
  "Social Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
];
const DEFAULT_EXAM_TYPES = ["TERM 1", "TERM 2", "FINAL"];

function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
}

export default function TeacherMarksTab() {
  const router = useRouter();
  const initialClasses = peekTeacherMarksClasses();
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [subjectOptions, setSubjectOptions] = useState<string[]>(DEFAULT_SUBJECTS);
  const [examTypeOptions, setExamTypeOptions] =
    useState<string[]>(DEFAULT_EXAM_TYPES);
  const [form, setForm] = useState(() => {
    const first = initialClasses?.[0];
    return {
      classId: first?.id ?? "",
      classLabel: first
        ? first.section
          ? `${first.name} - ${first.section}`
          : first.name
        : "",
      section: first?.section || "Section A",
      subject: "Mathematics",
      examType: "TERM 1",
      maxMarks: 100,
    };
  });
  const [activeBtn, setActiveBtn] = useState<null | "save" | "import" | "export">(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const pageSize = 8;

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
      if (list.length > 0) {
        setForm((prev) => {
          if (prev.classId) return prev;
          const first = list[0];
          return {
            ...prev,
            classId: first.id,
            classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
            section: first.section || "Section A",
          };
        });
      }
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
      marks.forEach((m) => {
        if (!markByStudent[m.studentId] || new Date(m.createdAt) > new Date(markByStudent[m.studentId].createdAt)) {
          markByStudent[m.studentId] = m;
        }
      });
      const newRows: StudentRow[] = students.map((s) => {
        const name = s.user?.name ?? "Student";
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=40&background=4ade80&color=fff`;
        const mark = markByStudent[s.id];
        return {
          id: s.id,
          rollNo: s.rollNo ?? "--",
          name,
          avatar: s.user?.photoUrl?.trim() || fallbackAvatar,
          marks: mark ? (mark.marks as number) : "",
          maxMarks: form.maxMarks,
          markId: mark?.id,
        };
      });
      setRows(newRows);
      setSaveMessage("");
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [form.classId, form.subject, form.examType]);

  const fetchExamTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/exam-types", { cache: "no-store" });
      if (!res.ok) {
        setExamTypeOptions(DEFAULT_EXAM_TYPES);
        return;
      }
      const data = await res.json();
      const names: string[] = Array.isArray(data.examTypes)
        ? data.examTypes
        : DEFAULT_EXAM_TYPES;
      setExamTypeOptions(names);
      setForm((prev) => ({
        ...prev,
        examType:
          names.includes(prev.examType) || !names.length
            ? prev.examType
            : names[0],
      }));
    } catch {
      setExamTypeOptions(DEFAULT_EXAM_TYPES);
    }
  }, []);

  const fetchSavedExamFields = useCallback(async () => {
    try {
      const subjectsRes = await fetch("/api/exam-subjects", {
        cache: "no-store",
        credentials: "include",
      });
      if (subjectsRes.ok) {
        const subjectsData = await subjectsRes.json();
        const savedSubjects = Array.isArray(subjectsData.subjects)
          ? subjectsData.subjects
              .map((subject: string) => subject?.trim())
              .filter((subject: string | undefined): subject is string => Boolean(subject))
          : [];
        if (savedSubjects.length > 0) {
          setSubjectOptions((prev) => Array.from(new Set([...savedSubjects, ...prev])));
          setForm((prev) =>
            savedSubjects.includes(prev.subject)
              ? prev
              : { ...prev, subject: savedSubjects[0] }
          );
        }
      }

      const params = new URLSearchParams();
      if (form.classId) params.set("classId", form.classId);
      const res = await fetch(`/api/exams/terms?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const exams = Array.isArray(data.exams) ? data.exams : [];

      const savedSubjects: string[] = Array.from(
        new Set<string>(
          exams
            .map((exam: { subject?: string }) => exam.subject?.trim())
            .filter((subject: string | undefined): subject is string => Boolean(subject))
        )
      );
      const savedExamNames: string[] = Array.from(
        new Set<string>(
          exams
            .map((exam: { name?: string }) => exam.name?.trim().toUpperCase())
            .filter((name: string | undefined): name is string => Boolean(name))
        )
      );

      if (savedSubjects.length > 0) {
        setSubjectOptions((prev) =>
          Array.from(new Set<string>([...savedSubjects, ...prev]))
        );
      }

      if (savedExamNames.length > 0) {
        setExamTypeOptions((prev) =>
          Array.from(new Set<string>([...savedExamNames, ...prev]))
        );
        setForm((prev) =>
          savedExamNames.includes(prev.examType)
            ? prev
            : { ...prev, examType: savedExamNames[0] }
        );
      }
    } catch {
      /* noop */
    }
  }, [form.classId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [fetchStudentsAndMarks]);

  useEffect(() => {
    fetchExamTypes();
  }, [fetchExamTypes]);

  useEffect(() => {
    fetchSavedExamFields();
  }, [fetchSavedExamFields]);

  useEffect(() => {
    setPage(1);
  }, [form.classId, form.subject, form.examType]);

  const handleChange = (key: string, value: string) => {
    if (key === "class") {
      if (!value || value === "Select class") {
        setForm((prev) => ({ ...prev, classId: "", classLabel: "", section: "" }));
        return;
      }
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

  const updateMaxMarks = (value: string) => {
    const num = Math.min(1000, Math.max(1, Number(value) || 100));
    setForm((prev) => ({ ...prev, maxMarks: num }));
    setRows((prev) => prev.map((r) => ({ ...r, maxMarks: num })));
  };

  const getPercentage = (m: number | "", max: number) =>
    m === "" ? "--" : `${((Number(m) / max) * 100).toFixed(1)}%`;

  const getGrade = (m: number | "", max: number) => {
    if (m === "" || max <= 0) return "--";
    const pct = (Number(m) / max) * 100;
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    return "C";
  };

  const total = rows.length;
  const entered = rows.filter((r) => r.marks !== "").length;
  const pending = total - entered;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage]
  );

  const handleSaveAll = async () => {
    if (pending > 0 || !form.classId) return;
    setSaveLoading(true);
    setSaveMessage("");
    try {
      const editableRows = rows.filter((row) => row.marks !== "");
      const results = await Promise.all(
        editableRows.map(async (row) => {
          const payload = {
            studentId: row.id,
            classId: form.classId,
            subject: form.subject,
            marks: Number(row.marks),
            totalMarks: row.maxMarks,
            examType: form.examType || null,
          };

          const res = row.markId
            ? await fetch(`/api/marks/${row.markId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  marks: payload.marks,
                  totalMarks: payload.totalMarks,
                  examType: payload.examType,
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
        <input
          type="number"
          value={row.marks}
          onChange={(e) => updateMarks(row.id, e.target.value)}
          className="w-20 text-center rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white outline-none"
        />
      ),
    },
    { header: "MAX MARKS", align: "center", accessor: "maxMarks" },
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
              g === "A+" ? "bg-lime-400/10 text-lime-400 border-lime-400/30" : "bg-white/5 text-gray-200 border-white/20"
            }`}
          >
            {g}
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
          title="Marks Entry"
          subtitle="Enter and manage student marks for your classes"
        />

        {classesLoading && classes.length === 0 && (
          <TimellyLoader title="Loading classes" steps={["Classes", "Subjects", "Marks"]} />
        )}

        {/* FILTER BAR */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
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
              options={subjectOptions}
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
                onChange={(e) => updateMaxMarks(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
              />
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
                  data={pagedRows}
                  rowKey={(row) => row.id}
                  emptyText="No students in this class. Select a class above."
                  pagination={{
                    page: safePage,
                    totalPages,
                    onChange: setPage,
                  }}
                />
              </div>

              <div className="md:hidden space-y-4 p-4">
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-4 pb-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-white/60">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
                {pagedRows.length === 0 ? (
                  <p className="text-white/60 text-center py-6">No students in this class.</p>
                ) : (
                  pagedRows.map((student) => {
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
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={student.maxMarks}
                              value={student.marks === "" ? "" : student.marks}
                              onChange={(e) => updateMarks(student.id, e.target.value)}
                              className="w-24 text-center rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white text-sm outline-none focus:border-lime-400/50"
                            />
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/60">Max: {student.maxMarks}</span>
                            <span className="text-white font-semibold">{percentage}</span>
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
                  <span className="text-red-400">
                    PENDING <span className="font-semibold ml-1">{pending}</span>
                  </span>
                </div>
                {saveMessage ? (
                  <span className="text-sm text-white/70">{saveMessage}</span>
                ) : null}
                <button
                  disabled={pending > 0 || saveLoading}
                  onClick={handleSaveAll}
                  className={`px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition
                    ${
                      pending === 0 && !saveLoading
                        ? "bg-lime-400/20 text-lime-400 border border-lime-400/30 hover:shadow-[0_0_15px_rgba(163,230,53,0.2)]"
                        : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                    }`}
                >
                  <Save size={16} />
                  {saveLoading ? "Saving…" : "Save All Marks"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
