"use client";

import PageHeader from "../common/PageHeader";
import HeaderActionButton from "../common/HeaderActionButton";

import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Download,
  Plus,
  User,
  Users,
  Search,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PDFPage } from "pdf-lib";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AddClassPanel from "./classes-panels/AddClassPanel";
import AddSectionPanel from "./classes-panels/AddSectionPanel";
import UploadCsvPanel from "./classes-panels/UploadCsvPanel";
import ClassDetailsPanel from "./classes-panels/ClassDetailsPanel";
import EditClassPanel from "./classes-panels/EditClassPanel";
import DeleteClassPanel from "./classes-panels/DeleteClassPanel";
import SearchInput from "../common/SearchInput";
import SelectInput from "../common/SelectInput";
import InlinePanelTable from "../common/InlinePanelTable";
import Spinner from "../common/Spinner";
import StatCard from "./StatCard";


export default function SchoolAdminClassesTab() {
  const router = useRouter();
  type ApiClassRow = {
    id: string;
    name?: string | null;
    section?: string | null;
    _count?: { students?: number } | null;
    teacher?: { name?: string | null; email?: string | null } | null;
  };

  const [activeAction, setActiveAction] = useState<
    "class" | "section" | "csv" | "none"
  >("class");
  const [search, setSearch] = useState("");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "edit" | "delete" | null>(null);
  const [mobileEdit, setMobileEdit] = useState<{ className: string; section: string } | null>(null);
  const [classRows, setClassRows] = useState<
    {
      id: string;
      name: string;
      section: string;
      students: number;
      teacher: string;
      subject: string;
    }[]
  >([]);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [avgSize, setAvgSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isReportDownloading, setIsReportDownloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 6;
  const [reportStatus, setReportStatus] = useState<
    "idle" | "downloading" | "success"
  >("idle");
  const [savingClassId, setSavingClassId] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [classesRes, studentsRes, teachersRes] = await Promise.all([
        fetch("/api/class/list", { method: "GET" }),
        fetch("/api/student/list?take=1&includeTotal=1", { method: "GET" }),
        fetch("/api/teacher/list", { method: "GET" }),
      ]);

      if (!classesRes.ok) {
        throw new Error("Failed to load classes.");
      }

      const [classesData, studentsData, teachersData] = await Promise.all([
        classesRes.json(),
        studentsRes.ok ? studentsRes.json() : Promise.resolve(null),
        teachersRes.ok ? teachersRes.json() : Promise.resolve(null),
      ]);

      const rows: ApiClassRow[] = Array.isArray(classesData?.classes)
        ? classesData.classes
        : [];
      const studentCount =
        typeof studentsData?.total === "number"
          ? studentsData.total
          : Array.isArray(studentsData?.students)
            ? studentsData.students.length
            : 0;
      const teacherCount = Array.isArray(teachersData?.teachers)
        ? teachersData.teachers.length
        : 0;

      setClassRows(
        rows.map((row) => ({
          id: row.id,
          name: row.name ?? "Untitled",
          section: row.section ? `Section ${row.section}` : "—",
          students: row?._count?.students ?? 0,
          teacher: row?.teacher?.name ?? "Unassigned",
          subject: row?.teacher?.email ?? "",
        }))
      );
      setTotalClasses(rows.length);
      setTotalStudents(studentCount);
      setTotalTeachers(teacherCount);
      setAvgSize(rows.length > 0 ? Math.round(studentCount / rows.length) : 0);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load classes.";
      setClassRows([]);
      setLoadError(message);
      setTotalClasses(0);
      setTotalStudents(0);
      setTotalTeachers(0);
      setAvgSize(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshAfterMutation = useCallback(() => {
    void loadClasses();
    try {
      router.refresh();
    } catch {
      /* noop */
    }
  }, [loadClasses, router]);

  useEffect(() => {
    let isActive = true;
    if (!isActive) return;
    loadClasses();
    return () => {
      isActive = false;
    };
  }, [loadClasses]);

  const filteredRows = classRows.filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.name.toLowerCase().includes(q) ||
      row.section.toLowerCase().includes(q) ||
      row.teacher.toLowerCase().includes(q) ||
      row.subject.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const pagedRows = filteredRows.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const tableColumns = [
    {
      header: "CLASS NAME",
      render: (row: (typeof classRows)[number]) => (
        <span className="text-white font-medium">{row.name}</span>
      ),
    },
    {
      header: "SECTION",
      render: (row: (typeof classRows)[number]) => (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
          {row.section}
        </span>
      ),
    },
    {
      header: "STUDENTS",
      align: "center" as const,
      render: (row: (typeof classRows)[number]) => (
        <span className="text-white font-semibold">{row.students}</span>
      ),
    },
    {
      header: "CLASS TEACHER",
      render: (row: (typeof classRows)[number]) => (
        <div>
          <div className="text-white font-medium">{row.teacher}</div>
          <div className="text-xs text-white/40">{row.subject}</div>
        </div>
      ),
    },
    {
      header: "ACTIONS",
      align: "center" as const,
      render: (row: (typeof classRows)[number]) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "view") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("view");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="View"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "edit") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("edit");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-green-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "delete") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("delete");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const handleReportClick = async () => {
    if (isReportDownloading) return;
    setIsReportDownloading(true);
    try {
      const rowsToExport = filteredRows;
      if (rowsToExport.length === 0) {
        window.alert("No classes available to export.");
        setIsReportDownloading(false);
        return;
      }

      window.alert("Report is downloading...");

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const pageWidth = 842;
      const pageHeight = 595;
      const marginX = 40;
      const topMargin = 44;
      const bottomMargin = 40;
      const titleSize = 18;
      const metaSize = 10;
      const headerSize = 10;
      const cellSize = 10;
      const rowHeight = 22;

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const columns = [
        { header: "CLASS NAME", width: 220, key: "name" as const },
        { header: "SECTION", width: 120, key: "section" as const },
        { header: "STUDENTS", width: 90, key: "students" as const },
        { header: "CLASS TEACHER", width: 190, key: "teacher" as const },
        { header: "EMAIL", width: 170, key: "subject" as const },
      ];

      const truncateText = (
        value: string,
        maxWidth: number,
        useBold = false
      ) => {
        const currentFont = useBold ? boldFont : font;
        let text = value ?? "";
        while (
          text.length > 0 &&
          currentFont.widthOfTextAtSize(text, cellSize) > maxWidth
        ) {
          text = `${text.slice(0, -1)}`;
        }
        if (text !== value) {
          const dots = "...";
          while (
            text.length > 0 &&
            currentFont.widthOfTextAtSize(`${text}${dots}`, cellSize) > maxWidth
          ) {
            text = `${text.slice(0, -1)}`;
          }
          return `${text}${dots}`;
        }
        return text;
      };

      const drawHeaderRow = (page: PDFPage, y: number) => {
        let x = marginX;
        page.drawLine({
          start: { x: marginX, y: y + 5 },
          end: { x: pageWidth - marginX, y: y + 5 },
          thickness: 1,
          color: rgb(0.82, 0.82, 0.82),
        });
        columns.forEach((column) => {
          page.drawText(column.header, {
            x: x + 2,
            y,
            size: headerSize,
            font: boldFont,
            color: rgb(0.15, 0.15, 0.15),
          });
          x += column.width;
        });
        page.drawLine({
          start: { x: marginX, y: y - 6 },
          end: { x: pageWidth - marginX, y: y - 6 },
          thickness: 1,
          color: rgb(0.82, 0.82, 0.82),
        });
      };

      const makePage = () => {
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawText("Classes Report", {
          x: marginX,
          y: pageHeight - topMargin,
          size: titleSize,
          font: boldFont,
          color: rgb(0.05, 0.05, 0.05),
        });
        page.drawText(
          `Generated on ${new Date().toLocaleString()} | Total Classes: ${rowsToExport.length}`,
          {
            x: marginX,
            y: pageHeight - topMargin - 16,
            size: metaSize,
            font,
            color: rgb(0.35, 0.35, 0.35),
          }
        );
        const startY = pageHeight - topMargin - 40;
        drawHeaderRow(page, startY);
        return { page, y: startY - 18 };
      };

      let { page, y } = makePage();

      rowsToExport.forEach((row) => {
        if (y < bottomMargin + rowHeight) {
          const next = makePage();
          page = next.page;
          y = next.y;
        }

        let x = marginX;
        const values = [
          row.name,
          row.section,
          String(row.students),
          row.teacher,
          row.subject || "-",
        ];

        values.forEach((value, idx) => {
          page.drawText(truncateText(String(value ?? ""), columns[idx].width - 6), {
            x: x + 2,
            y,
            size: cellSize,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
          x += columns[idx].width;
        });

        page.drawLine({
          start: { x: marginX, y: y - 6 },
          end: { x: pageWidth - marginX, y: y - 6 },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        });
        y -= rowHeight;
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([Uint8Array.from(pdfBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `classes-report-${date}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Failed to generate report.");
    } finally {
      setIsReportDownloading(false);
    }
  };

  const closePanel = () => {
    setPanelMode(null);
    setActiveRowId(null);
    setMobileEdit(null);
  };

  const handleTempDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/class/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to delete class.");
      }
      setClassRows((prev) => {
        const next = prev.filter((row) => row.id !== id);
        setTotalClasses(next.length);
        setAvgSize(
          next.length > 0 ? Math.round(totalStudents / next.length) : 0
        );
        return next;
      });
      closePanel();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete class.");
    }
  };

  const saveClassChanges = async (payload: {
    id: string;
    name: string;
    section: string;
    teacherId?: string;
  }) => {
    setSavingClassId(payload.id);
    try {
      const res = await fetch(`/api/class/${payload.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          section: payload.section,
          teacherId: payload.teacherId ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update class.");
      }
      const updated = data?.class;
      if (updated) {
        setClassRows((prev) =>
          prev.map((row) =>
            row.id === payload.id
              ? {
                  ...row,
                  name: updated.name ?? row.name,
                  section: updated.section
                    ? `Section ${updated.section}`
                    : row.section,
                  teacher: updated.teacher?.name ?? row.teacher,
                  subject: updated.teacher?.email ?? row.subject,
                }
              : row
          )
        );
      }
      return true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to update class.");
      return false;
    } finally {
      setSavingClassId(null);
    }
  };

  const renderButton = (
    type: "class" | "section" | "csv" | "report",
    Icon: LucideIcon,
    label: string,
    onClick: () => void,
    primary?: boolean,
    disabled?: boolean
  ) => {
    const isActive =
      (type === "class" && activeAction === "class") ||
      (type === "section" && activeAction === "section") ||
      (type === "csv" && activeAction === "csv");

    return (
      <>
        {/* MOBILE */}
        <div className="xl:hidden">
          {isActive ? (
            <HeaderActionButton
              icon={Icon}
              label={label}
              primary={primary}
              onClick={onClick}
            />
          ) : (
            <button
              onClick={() => {
                if (!disabled) onClick();
              }}
              disabled={disabled}
              className={`h-10 w-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 ${
                disabled ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <Icon size={18} />
            </button>
          )}
        </div>

        {/* DESKTOP */}
        <div className="hidden xl:block">
          <HeaderActionButton
            icon={Icon}
            label={label}
            primary={primary}
            onClick={() => {
              if (!disabled) onClick();
            }}
          />
        </div>
      </>
    );
  };

  return (
    <div className=" pb-24 lg:pb-6">
      <div className="w-full space-y-6 text-gray-200">
        {/* ================= HEADER ================= */}
        <PageHeader
          title="Classes Management"
          subtitle="Manage all classes, sections, and class teachers"
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-white/10 shadow-lg flex flex-col xl:flex-row xl:items-center justify-between gap-4"
          rightSlot={
            <div className="w-full xl:w-auto">
              <div className="flex flex-wrap gap-2 sm:gap-3 xl:justify-end">
                {renderButton(
                  "class",
                  Plus,
                  "Add Class",
                  () => setActiveAction("class"),
                  true
                )}

                {renderButton(
                  "section",
                  ChevronDown,
                  "Add Section",
                  () => setActiveAction("section")
                )}

                {/* {renderButton(
                  "csv",
                  Upload,
                  "Upload CSV",
                  () => setActiveAction("csv")
                )} */}

                {renderButton(
                  "report",
                  Download,
                  isReportDownloading ? "Downloading..." : "Report",
                  handleReportClick,
                  false,
                  isReportDownloading
                )}
              </div>
            </div>
          }
        />

        {activeAction === "class" && (
          <AddClassPanel
            onCancel={() => setActiveAction("none")}
            onSuccess={() => {
              setActiveAction("none");
              refreshAfterMutation();
            }}
          />
        )}
        {activeAction === "section" && (
          <AddSectionPanel
            onCancel={() => setActiveAction("none")}
            onSuccess={() => {
              setActiveAction("none");
              refreshAfterMutation();
            }}
          />
        )}
        {activeAction === "csv" && (
          <UploadCsvPanel
            onCancel={() => setActiveAction("none")}
            onSuccess={refreshAfterMutation}
          />
        )}

        {isLoading ? (
          <div className="py-6 flex items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Spinner size={28} label="Loading stats..." />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<BookOpen size={18} />}
              iconClassName="text-green-400"
              label="Total Classes"
              value={String(totalClasses)}
            />
            <StatCard
              icon={<Users size={18} />}
              iconClassName="text-violet-400"
              label="Total Students"
              value={String(totalStudents)}
            />
            <StatCard
              icon={<AlertTriangle size={18} />}
              iconClassName="text-orange-400"
              label="Avg Size"
              value={String(avgSize)}
            />
            <StatCard
              icon={<User size={18} />}
              iconClassName="text-blue-400"
              label="Teachers"
              value={String(totalTeachers)}
            />
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border-b border-white/10">
            <div className="text-lg font-semibold text-white">All Classes</div>
            <div className="w-full md:w-[260px]">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search classes..."
                icon={Search}
                variant="glass"
              />
            </div>
          </div>

          <div className="px-4 pb-4 lg:px-0 lg:pb-0 md:px-0 md:pb-0">
            {/* Desktop table with inline panels */}
            <div className="hidden lg:block">
              <InlinePanelTable
                columns={tableColumns}
                data={pagedRows}
                emptyText="No classes found"
                activeRowId={activeRowId}
                panelKey={panelMode}
                renderPanel={(row) => {
                  if (panelMode === "view") {
                    return <ClassDetailsPanel row={row} onClose={closePanel} />;
                  }
                  if (panelMode === "edit") {
                    return (
                      <EditClassPanel
                        row={row}
                        onClose={closePanel}
                        onSuccess={refreshAfterMutation}
                      />
                    );
                  }
                  if (panelMode === "delete") {
                    return (
                      <DeleteClassPanel
                        row={row}
                        onCancel={closePanel}
                        onConfirm={() => {
                          closePanel();
                          refreshAfterMutation();
                        }}
                      />
                    );
                  }
                  return null;
                }}
              />
            </div>

            {/* Mobile/tablet cards */}
            <div className="lg:hidden space-y-4">
              {filteredRows.length === 0 && !isLoading && (
                <div className="text-center py-10 text-white/60">
                  {loadError ?? "No classes found"}
                </div>
              )}
              {isLoading && (
                <div className="text-center py-10 text-white/60">
                  <Spinner/>
                </div>
              )}
              {pagedRows.map((row) => (
                <div
                  key={row.id}
                  className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white font-semibold">{row.name}</div>
                      <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                        {row.section}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Students</div>
                      <div className="text-white font-semibold text-lg">{row.students}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">
                      Class Teacher
                    </div>
                    <div className="text-white font-medium">{row.teacher}</div>
                  </div>

                  {activeRowId === row.id && panelMode === "edit" ? (
                    <div className="mt-4 border-t border-white/10 pt-3 space-y-3">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="w-full rounded-xl bg-lime-400/30 text-lime-200 border border-lime-400/40 py-2 text-sm font-semibold hover:bg-lime-400/35 transition cursor-pointer"
                      >
                        Close
                      </button>

                      <SearchInput
                        label="Class Name"
                        value={mobileEdit?.className ?? row.name}
                        onChange={(value) =>
                          setMobileEdit((prev) => ({
                            className: value,
                            section: prev?.section ?? row.section.replace("Section ", ""),
                          }))
                        }
                        placeholder="Class name"
                        variant="glass"
                      />

                      <SelectInput
                        label="Section"
                        value={mobileEdit?.section ?? row.section.replace("Section ", "")}
                        onChange={(value) =>
                          setMobileEdit((prev) => ({
                            className: prev?.className ?? row.name,
                            section: value,
                          }))
                        }
                        options={[
                          { label: "A", value: "A" },
                          { label: "B", value: "B" },
                          { label: "C", value: "C" },
                        ]}
                      />

                      <button
                        type="button"
                      className="w-full rounded-xl bg-lime-400 text-black font-semibold py-2.5 hover:bg-lime-300 transition"
                        onClick={async () => {
                          const className = mobileEdit?.className ?? row.name;
                          const section =
                            mobileEdit?.section ??
                            row.section.replace("Section ", "");
                          const normalizedSection =
                            section === "—" || section === "â€”" ? "" : section;
                          const ok = await saveClassChanges({
                            id: row.id,
                            name: className,
                            section: normalizedSection,
                          });
                          if (ok) {
                            closePanel();
                            refreshAfterMutation();
                          }
                        }}
                        disabled={savingClassId === row.id}
                      >
                        {savingClassId === row.id ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRowId(row.id);
                        setPanelMode("edit");
                        setMobileEdit({
                          className: row.name,
                          section: row.section.replace("Section ", ""),
                        });
                      }}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>

            {filteredRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-white/10 text-white/70">
                <div className="text-xs">
                  Showing {Math.min(startIndex + 1, filteredRows.length)}-
                  {Math.min(endIndex, filteredRows.length)} of {filteredRows.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer"
                  >
                    Prev
                  </button>
                  <div className="text-xs">
                    Page {safePage} of {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
