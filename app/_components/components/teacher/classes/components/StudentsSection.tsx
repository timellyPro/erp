"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, ChevronDown, ChevronUp, Mail } from "lucide-react";
import TableLayout from "../../../common/TableLayout";
import SectionHeaderWithSearch from "../../../common/SectionHeaderWithSearch";
import { AVATAR_URL } from "../../../../constants/images";
import type { StudentRow } from "../hooks/useTeacherClasses";
import type { StudentMetrics } from "../hooks/useClassMetrics";
import type { Column } from "../../../../types/superadmin";
import { useRouter } from "next/navigation";

type StudentWithMetrics = StudentRow & {
  metrics: StudentMetrics;
};

type StudentsSectionProps = {
  classTitle: string;
  students: StudentWithMetrics[];
  search: string;
  onSearch: (value: string) => void;
  expandedId: string | null;
  onToggleExpanded: (id: string) => void;
};

const formatPercent = (value: number | null) =>
  value === null ? "--" : `${value.toFixed(1)}%`;

const progressWidth = (value: number | null) =>
  value === null ? "0%" : `${Math.max(6, Math.min(100, value))}%`;

const gradeLabel = (value: string | null) => value ?? "--";

const progressColor = (value: number | null) => {
  if (value === null) return "bg-white/20";
  if (value >= 92) return "bg-lime-400";
  if (value >= 85) return "bg-amber-400";
  return "bg-orange-400";
};

const gradePillClass = (grade?: string | null) => {
  const g = grade?.toUpperCase() ?? "";
  if (g === "A+" || g === "A") return "bg-lime-400/15 text-lime-300 border-lime-400/30";
  if (g === "B+" || g === "B") return "bg-amber-400/15 text-amber-300 border-amber-400/30";
  return "bg-white/10 text-white/80 border-white/20";
};

const getPhotoUrl = (student: StudentWithMetrics) =>
  student.user?.photoUrl ||
  student.user?.image ||
  student.photoUrl ||
  AVATAR_URL;

export default function StudentsSection({
  classTitle,
  students,
  search,
  onSearch,
  expandedId,
  onToggleExpanded,
}: StudentsSectionProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = useMemo(
    () => students.slice((safePage - 1) * pageSize, safePage * pageSize),
    [students, safePage]
  );

  useEffect(() => {
    setPage(1);
  }, [search, students.length]);

  const expandedStudent = students.find((s) => s.id === expandedId) ?? null;
  const columns: Column<StudentWithMetrics>[] = [
    {
      header: "Roll No",
      accessor: "rollNo",
      align: "left",
      render: (row: StudentWithMetrics) =>
        row.rollNo ?? row.admissionNumber ?? "--",
    },
    {
      header: "Student Name",
      accessor: "user",
      align: "left",
      render: (row: StudentWithMetrics) => (
        <div className="flex items-center gap-3">
          <img
            src={getPhotoUrl(row)}
            alt={row.user?.name ?? "Student"}
            onError={(e) => {
              e.currentTarget.src = AVATAR_URL;
            }}
            className="w-10 h-10 rounded-xl object-cover border border-white/10"
          />
          <div>
            <div
              className={`text-sm font-medium text-white group-hover:text-lime-400 transition-colors ${
                expandedId === row.id ? "text-lime-300" : "text-white"
              }`}
            >
              {row.user?.name ?? "Unnamed Student"}
            </div>
            {/* <div className="text-xs text-white/40">
              {row.user?.email ?? "No email"}
            </div> */}
          </div>
        </div>
      ),
    },
    {
      header: "Attendance",
      accessor: "metrics",
      align: "center",
      render: (row: StudentWithMetrics) => (
        <div className="flex items-center justify-center gap-3">
          <div className="h-2 w-28 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${progressColor(
                row.metrics.attendancePct
              )}`}
              style={{ width: progressWidth(row.metrics.attendancePct) }}
            />
          </div>
          <span className="text-sm text-gray-300 font-medium">
            {formatPercent(row.metrics.attendancePct)}
          </span>
        </div>
      ),
    },
    {
      header: "Avg Marks",
      accessor: "metrics",
      align: "center",
      render: (row: StudentWithMetrics) =>
        formatPercent(row.metrics.avgMarksPct),
    },
    {
      header: "Grade",
      accessor: "metrics",
      align: "center",
      render: (row: StudentWithMetrics) => (
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider
              ${gradePillClass(
            row.metrics.grade
          )}`}
        >
          {gradeLabel(row.metrics.grade)}
        </span>
      ),
    },
    {
      header: "Actions",
      accessor: "id",
      align: "center",
      render: (row: StudentWithMetrics) => {
        const isExpanded = expandedId === row.id;
        return (
          <button
            type="button"
            onClick={() => onToggleExpanded(row.id)}
            className={`p-2 rounded-xl transition-all ${
              isExpanded
                ? "bg-lime-400 text-black"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
            aria-label="Toggle student details"
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        );
      },
    },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl mt-3">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6 pb-4 border-b border-white/10">
        <SectionHeaderWithSearch
          title={`${classTitle} Students`}
          subtitle={`${students.length} students enrolled`}
          searchValue={search}
          onSearch={onSearch}
          searchPlaceholder="Search by name or roll number..."
          searchWidthClassName="md:w-[360px]"
          searchInputClassName="rounded-full bg-white/5 border-white/10 text-white/80 placeholder-white/40"
        />
      </div>

      <div className="hidden md:block">
        <TableLayout
          columns={columns}
          data={pagedStudents}
          emptyText="No students found."
          showMobile={false}
          container={false}
          theadClassName="bg-white/5"
          thClassName="text-white/50 tracking-[0.18em]"
          rowClassName="hover:bg-white/5"
          tdClassName="py-5"
          pagination={{
            page: safePage,
            totalPages,
            onChange: setPage,
          }}
        />
      </div>

      {expandedStudent && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6 overflow-hidden bg-white/[0.02]">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all">
              <div className="font-semibold text-white mb-4 flex items-center gap-2 text-sm">
                <Mail size={14} className="text-lime-400 lucide lucide-mail w-4 h-4"/>
                Contact Information
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Email</div>
                  <div className="text-sm font-medium text-gray-200">
                    {expandedStudent.user?.email ?? "Not available"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Parent Contact</div>
                  <div className="text-sm font-medium text-gray-200">
                    {expandedStudent.phoneNo ?? "Not available"}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all">
              <div className="font-semibold text-white mb-4 flex items-center gap-2 text-sm">
                <Award size={14} className="rounded-lg text-lime-400 lucide lucide-award w-4 h-4"/>
                Performance & Actions
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Avg Marks</span>
                <span className="text-sm font-bold text-white">
                  {formatPercent(expandedStudent.metrics.avgMarksPct)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-white/70 mt-1 mb-2">
                <span className="text-sm text-gray-400">Attendance</span>
                <span className="text-white/90">
                  {formatPercent(expandedStudent.metrics.attendancePct)}
                </span>
              </div>
              <button
                type="button"
                className="mt-auto w-full rounded-full border border-lime-400/30
                bg-lime-400/15 px-4 py-2 text-sm font-semibold text-lime-300 hover:bg-lime-400/25 transition"
                onClick={()=>{router.push("/teacher?tab=chat")}}
              >
                Message Parent
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 md:hidden space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
        {pagedStudents.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60 text-center">
            No students found.
          </div>
        ) : (
          pagedStudents.map((student) => (
            <div
              key={student.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <button
                type="button"
                onClick={() => onToggleExpanded(student.id)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={getPhotoUrl(student)}
                    alt={student.user?.name ?? "Student"}
                    onError={(e) => {
                      e.currentTarget.src = AVATAR_URL;
                    }}
                    className="h-10 w-10 rounded-full object-cover border border-white/10"
                  />
                  <div>
                    <div className="text-white font-medium">
                      {student.user?.name ?? "Unnamed Student"}
                    </div>
                    <div className="text-xs text-white/40">
                      Roll: {student.rollNo ?? student.admissionNumber ?? "--"}
                    </div>
                  </div>
                </div>
                {expandedId === student.id ? (
                  <ChevronUp size={18} className="text-white/70" />
                ) : (
                  <ChevronDown size={18} className="text-white/70" />
                )}
              </button>

              {expandedId === student.id && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/50">Avg Marks</div>
                      <div className="text-white/90 font-semibold">
                        {formatPercent(student.metrics.avgMarksPct)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/50">Attendance</div>
                      <div className="text-lime-300 font-semibold">
                        {formatPercent(student.metrics.attendancePct)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-white/50">
                    Contact: {student.phoneNo ?? "Not available"}
                  </div>
                  <div className="text-xs text-white/50">
                    Email: {student.user?.email ?? "Not available"}
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm font-semibold text-lime-300 hover:bg-lime-400/20 transition"
                  >
                    Message
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
