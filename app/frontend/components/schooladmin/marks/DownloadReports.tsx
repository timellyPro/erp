"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Check,
  X,
  Search,
} from "lucide-react";
import { downloadConsolidatedMarksPdf } from "@/lib/consolidatedMarksPdf";

type ClassOption = {
  id: string;
  name: string;
  section: string | null;
  label: string;
};

type ConsolidatedStudent = {
  id: string;
  name: string;
  rollNo: string | null;
  admissionNumber: string | null;
  section?: string | null;
  subjectMarks: Record<string, number | "AB" | null>;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  rank: number;
};

type ConsolidatedSheet = {
  classId: string;
  className: string;
  section: string | null;
  label: string;
  includeSectionCol?: boolean;
  subjects: string[];
  students: ConsolidatedStudent[];
};

type ConsolidatedPayload = {
  school: {
    name: string;
    address: string;
    logoUrl?: string | null;
    admins?: Array<{ photoUrl?: string | null }>;
  };
  examType: string;
  groupBy?: "class" | "section";
  sheets: ConsolidatedSheet[];
};

const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];

function sheetNameSafe(label: string, used: Set<string>): string {
  let base = label.replace(/[\\/?*[\]:]/g, " ").trim().substring(0, 31) || "Sheet";
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = `_${i}`;
    name = `${base.substring(0, 31 - suffix.length)}${suffix}`;
    i++;
  }
  used.add(name.toLowerCase());
  return name;
}

function normalizeClassName(name: string): string {
  return name.trim().toUpperCase();
}

export default function SchoolAdminDownloadReports() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  /** class = combine all sections under a class name; section = one sheet per section */
  const [selectMode, setSelectMode] = useState<"class" | "section">("class");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>(DEFAULT_EXAM_TYPES);
  const [selectedExamType, setSelectedExamType] = useState("ALL");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState<"excel" | "pdf" | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    (async () => {
      setClassesLoading(true);
      try {
        const res = await fetch("/api/class/list?lite=1", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.classes) ? data.classes : [];
        setClasses(
          list.map(
            (c: { id: string; name: string; section?: string | null }) => ({
              id: c.id,
              name: c.name,
              section: c.section ?? null,
              label: c.section ? `${c.name} - ${c.section}` : c.name,
            })
          )
        );
      } catch {
        setClasses([]);
      } finally {
        setClassesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [examRes, subRes] = await Promise.all([
          fetch("/api/exam-types", { cache: "no-store", credentials: "include" }),
          fetch("/api/exam-subjects", { cache: "no-store", credentials: "include" }),
        ]);
        if (examRes.ok) {
          const data = await examRes.json();
          const names: string[] = Array.isArray(data.examTypes) ? data.examTypes : [];
          if (names.length > 0) setExamTypeOptions(["ALL", ...names]);
        }
        if (subRes.ok) {
          const data = await subRes.json();
          const names: string[] = Array.isArray(data.subjects) ? data.subjects : [];
          setSubjectOptions(names);
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  const classGroups = useMemo(() => {
    const map = new Map<string, { name: string; sections: ClassOption[] }>();
    for (const c of classes) {
      const key = normalizeClassName(c.name);
      const existing = map.get(key);
      if (existing) existing.sections.push(c);
      else map.set(key, { name: c.name, sections: [c] });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [classes]);

  const filteredOptions = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (selectMode === "class") {
      const items = classGroups.map((g) => ({
        key: normalizeClassName(g.name),
        label: g.name,
        hint:
          g.sections.length > 1
            ? `${g.sections.length} sections combined`
            : g.sections[0]?.section
              ? `Section ${g.sections[0].section}`
              : "1 class",
      }));
      if (!q) return items;
      return items.filter((i) => i.label.toLowerCase().includes(q));
    }
    const items = classes.map((c) => ({
      key: c.id,
      label: c.label,
      hint: null as string | null,
    }));
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [selectMode, classGroups, classes, classSearch]);

  const resolveSelectedClassIds = (): string[] => {
    if (selectMode === "section") return Array.from(selectedKeys);
    const ids: string[] = [];
    for (const key of selectedKeys) {
      const group = classGroups.find((g) => normalizeClassName(g.name) === key);
      if (group) ids.push(...group.sections.map((s) => s.id));
    }
    return ids;
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visible = filteredOptions.map((o) => o.key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((k) => next.has(k));
      if (allSelected) visible.forEach((k) => next.delete(k));
      else visible.forEach((k) => next.add(k));
      return next;
    });
  };

  const changeMode = (mode: "class" | "section") => {
    setSelectMode(mode);
    setSelectedKeys(new Set());
    setClassSearch("");
  };

  const toggleSubject = (name: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllSubjects = () => {
    setSelectedSubjects((prev) => {
      if (prev.size === subjectOptions.length) return new Set();
      return new Set(subjectOptions);
    });
  };

  const fetchConsolidated = async (): Promise<ConsolidatedPayload> => {
    const classIds = resolveSelectedClassIds();
    if (classIds.length === 0) throw new Error("Select at least one class or section");

    const params = new URLSearchParams({
      classIds: classIds.join(","),
      groupBy: selectMode,
    });
    if (selectedExamType && selectedExamType !== "ALL") {
      params.set("examType", selectedExamType);
    }
    if (selectedSubjects.size > 0) {
      params.set("subjects", Array.from(selectedSubjects).join(","));
    }

    const res = await fetch(`/api/marks/consolidated?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json()) as ConsolidatedPayload & { message?: string };
    if (!res.ok) throw new Error(data.message || "Failed to load consolidated marks");
    if ((data.sheets ?? []).length === 0) throw new Error("No class sheets to export");
    return data;
  };

  const handleDownloadExcel = async () => {
    if (selectedKeys.size === 0) return;
    setDownloading(true);
    setDownloadType("excel");
    setProgress("Building consolidated marks…");

    try {
      const data = await fetchConsolidated();

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Timelly";
      const usedNames = new Set<string>();

      const examLabel =
        data.examType && data.examType !== "ALL" ? data.examType : "ALL EXAMS";
      const schoolName = data.school?.name ?? "School";

      for (const sheet of data.sheets ?? []) {
        const ws = workbook.addWorksheet(sheetNameSafe(sheet.label, usedNames));
        const subjects = sheet.subjects ?? [];
        const showSection = Boolean(sheet.includeSectionCol);
        const colCount = 2 + (showSection ? 1 : 0) + subjects.length + 4;

        ws.mergeCells(1, 1, 1, colCount);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = schoolName.toUpperCase();
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };

        ws.mergeCells(2, 1, 2, colCount);
        const subCell = ws.getCell(2, 1);
        subCell.value = `CONSOLIDATED MARKS LIST — ${examLabel}        CLASS: ${sheet.label}`;
        subCell.font = { bold: true, size: 11 };
        subCell.alignment = { horizontal: "center", vertical: "middle" };

        const headers = [
          "S.NO",
          "NAME OF THE STUDENT",
          ...(showSection ? ["SECTION"] : []),
          ...subjects,
          "TOTAL",
          "PERCENTAGE",
          "GRADE",
          "RANK",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, size: 10 };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F5C8" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        sheet.students.forEach((stu, idx) => {
          const rowVals: (string | number | null)[] = [
            idx + 1,
            stu.name,
            ...(showSection ? [stu.section ?? ""] : []),
            ...subjects.map((sub) => {
              const v = stu.subjectMarks?.[sub];
              if (v === "AB") return "AB";
              if (v === null || v === undefined) return "";
              return v;
            }),
            stu.totalMax > 0 ? stu.totalObtained : "",
            stu.totalMax > 0 ? stu.percentage : "",
            stu.totalMax > 0 ? stu.grade : "",
            stu.totalMax > 0 ? stu.rank : "",
          ];
          const row = ws.addRow(rowVals);
          row.eachCell((cell, colNumber) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            cell.alignment = {
              horizontal: colNumber === 2 ? "left" : "center",
              vertical: "middle",
            };
          });
        });

        ws.getColumn(1).width = 8;
        ws.getColumn(2).width = 28;
        let col = 3;
        if (showSection) {
          ws.getColumn(col).width = 10;
          col++;
        }
        for (let i = 0; i < subjects.length; i++) ws.getColumn(col + i).width = 12;
        col += subjects.length;
        ws.getColumn(col).width = 10;
        ws.getColumn(col + 1).width = 12;
        ws.getColumn(col + 2).width = 10;
        ws.getColumn(col + 3).width = 8;
        ws.getRow(1).height = 22;
        ws.getRow(2).height = 20;
      }

      if ((data.sheets ?? []).length === 0) {
        throw new Error("No class sheets to export");
      }

      setProgress("Downloading Excel…");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const examFile =
        selectedExamType === "ALL" ? "ALL_EXAMS" : selectedExamType.replace(/\s+/g, "_");
      const modeFile = selectMode === "class" ? "BY_CLASS" : "BY_SECTION";
      a.href = url;
      a.download = `${examFile}_CONSOLIDATED_${modeFile}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress("Done");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate Excel");
      setProgress("");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
        setProgress("");
      }, 800);
    }
  };

  const handleDownloadPdf = async () => {
    if (selectedKeys.size === 0) return;
    setDownloading(true);
    setDownloadType("pdf");
    setProgress("Building consolidated marks…");

    try {
      const data = await fetchConsolidated();
      setProgress("Generating PDF…");

      const examFile =
        selectedExamType === "ALL" ? "ALL_EXAMS" : selectedExamType.replace(/\s+/g, "_");
      const modeFile = selectMode === "class" ? "BY_CLASS" : "BY_SECTION";

      await downloadConsolidatedMarksPdf(
        {
          school: data.school,
          examType: data.examType,
          sheets: data.sheets ?? [],
        },
        `${examFile}_CONSOLIDATED_${modeFile}_${new Date().toISOString().slice(0, 10)}.pdf`
      );
      setProgress("Done");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate PDF");
      setProgress("");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
        setProgress("");
      }, 800);
    }
  };

  const allVisibleSelected =
    filteredOptions.length > 0 &&
    filteredOptions.every((o) => selectedKeys.has(o.key));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="text-lg font-bold text-white">Consolidated Marks Download</h3>
          <p className="text-sm text-white/50 mt-1">
            Choose <span className="text-white/80">By class</span> to combine all sections
            (e.g. Class 10 A+B+C → one sheet), or{" "}
            <span className="text-white/80">By section</span> for separate sheets (10-A, 10-B).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">DOWNLOAD MODE</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => changeMode("class")}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                selectMode === "class"
                  ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              By class (combine sections)
            </button>
            <button
              type="button"
              onClick={() => changeMode("section")}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                selectMode === "section"
                  ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              By section (separate sheets)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">EXAM TYPE</label>
          <select
            value={selectedExamType}
            onChange={(e) => setSelectedExamType(e.target.value)}
            className="w-full sm:w-72 px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
          >
            {examTypeOptions.map((t) => (
              <option key={t} value={t} className="bg-gray-900">
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-medium text-white/60">
              SUBJECTS <span className="text-white/35">(optional — leave empty for all)</span>
            </label>
            <button
              type="button"
              onClick={selectAllSubjects}
              className="text-xs text-lime-400 hover:underline"
            >
              {selectedSubjects.size === subjectOptions.length ? "Clear subjects" : "Select all subjects"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar">
            {subjectOptions.length === 0 ? (
              <span className="text-xs text-white/40">No subjects configured</span>
            ) : (
              subjectOptions.map((s) => {
                const on = selectedSubjects.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      on
                        ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    {s}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <label className="text-xs font-medium text-white/60">
              {selectMode === "class" ? "CLASSES" : "SECTIONS"}{" "}
              <span className="text-lime-400">({selectedKeys.size} selected)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  placeholder={selectMode === "class" ? "Search class…" : "Search section…"}
                  className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-lime-400/50"
                />
              </div>
              <button
                type="button"
                onClick={selectAllVisible}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 whitespace-nowrap"
              >
                {allVisibleSelected ? "Clear visible" : "Select all visible"}
              </button>
            </div>
          </div>

          {classesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-lime-400" size={24} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto no-scrollbar p-1">
              {filteredOptions.map((o) => {
                const on = selectedKeys.has(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => toggleKey(o.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm border transition ${
                      on
                        ? "bg-lime-400/15 border-lime-400/40 text-lime-200"
                        : "bg-black/30 border-white/10 text-white/70 hover:border-white/20"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border shrink-0 ${
                        on ? "bg-lime-400 border-lime-400 text-black" : "border-white/20"
                      }`}
                    >
                      {on ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.label}</span>
                      {o.hint ? (
                        <span className="block text-[10px] text-white/40 truncate">{o.hint}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <p className="col-span-full text-sm text-white/40 py-4 text-center">
                  No classes found
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={downloading || selectedKeys.size === 0}
            onClick={handleDownloadExcel}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold transition ${
              !downloading && selectedKeys.size > 0
                ? "bg-lime-400 text-black hover:bg-lime-300"
                : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
            }`}
          >
            {downloading && downloadType === "excel" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            {downloading && downloadType === "excel" ? "Generating…" : "Download Excel"}
          </button>
          <button
            type="button"
            disabled={downloading || selectedKeys.size === 0}
            onClick={handleDownloadPdf}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold transition ${
              !downloading && selectedKeys.size > 0
                ? "bg-blue-500 text-white hover:bg-blue-400"
                : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
            }`}
          >
            {downloading && downloadType === "pdf" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {downloading && downloadType === "pdf" ? "Generating…" : "Download PDF"}
          </button>
          {selectedKeys.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="px-4 py-3 rounded-xl text-sm text-white/50 hover:text-white/80 flex items-center gap-1"
            >
              <X size={14} /> Clear selection
            </button>
          )}
          {progress ? (
            <span className="text-sm text-white/60 flex items-center gap-2">
              <Download size={14} /> {progress}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
