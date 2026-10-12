import { Column } from "@/app/_components/types/superadmin";
import type { ExamTypeSectionOption } from "@/lib/exams/examTypes";
import type { StudentRow } from "./types";

export function useMarksEntryColumns({
  hasSubsections,
  termSections,
  updateComponentScore,
  updateMarks,
  toggleAbsent,
  editingMaxId,
  maxMarksLocked,
  editingMaxValue,
  setEditingMaxValue,
  setEditingMaxId,
  commitEditMaxMarks,
  startEditMaxMarks,
  getPercentage,
  getGrade,
}: {
  hasSubsections: boolean;
  termSections: ExamTypeSectionOption[];
  updateComponentScore: (studentId: string, sectionName: string, value: string) => void;
  updateMarks: (id: string, value: string) => void;
  toggleAbsent: (id: string) => void;
  editingMaxId: string | null;
  maxMarksLocked: boolean;
  editingMaxValue: string;
  setEditingMaxValue: (v: string) => void;
  setEditingMaxId: (id: string | null) => void;
  commitEditMaxMarks: (id: string) => void;
  startEditMaxMarks: (id: string, current: number | "") => void;
  getPercentage: (m: number | "" | "AB", max: number | "") => string;
  getGrade: (m: number | "" | "AB", max: number | "") => string;
}) {
  const columns: Column<StudentRow>[] = [
    { header: "ROLL NO", accessor: "rollNo" },
    {
      header: "STUDENT NAME",
      render: (row: StudentRow) => (
        <div className="flex items-center gap-3">
          <img src={row.avatar} alt={row.name} className="w-9 h-9 rounded-full" />
          <span className="whitespace-nowrap font-medium text-white">{row.name}</span>
        </div>
      ),
    },
    ...(hasSubsections
      ? termSections.map((sec) => ({
          header: `${sec.name.toUpperCase()} / ${sec.maxMarks}`,
          align: "center" as const,
          render: (row: StudentRow) => {
            const val = row.componentScores?.[sec.name];
            return (
              <div className="flex items-center justify-center">
                {val === "AB" || row.marks === "AB" ? (
                  <span className="w-16 text-center text-red-400 font-semibold text-sm">AB</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={sec.maxMarks}
                    value={val === undefined || val === "" ? "" : val}
                    onChange={(e) => updateComponentScore(row.id, sec.name, e.target.value)}
                    className="w-16 text-center rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white outline-none"
                  />
                )}
              </div>
            );
          },
        }))
      : [
          {
            header: "MARKS OBTAINED",
            align: "center" as const,
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
        ]),
    ...(hasSubsections
      ? [
          {
            header: "TOTAL",
            align: "center" as const,
            render: (row: StudentRow) => (
              <span className="font-medium text-white">
                {row.marks === "AB" ? "AB" : row.marks === "" ? "—" : row.marks}
              </span>
            ),
          },
          {
            header: "AB",
            align: "center" as const,
            render: (row: StudentRow) => (
              <button
                type="button"
                onClick={() => toggleAbsent(row.id)}
                title={row.marks === "AB" ? "Remove absent" : "Mark as absent"}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                  row.marks === "AB"
                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-white/5 text-white/40 border-white/10"
                }`}
              >
                AB
              </button>
            ),
          },
        ]
      : []),
    {
      header: "MAX MARKS",
      align: "center",
      render: (row: StudentRow) =>
        editingMaxId === row.id && !maxMarksLocked ? (
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
            title={maxMarksLocked ? "Locked by school admin" : "Double-click to edit max marks"}
            onDoubleClick={() => startEditMaxMarks(row.id, row.maxMarks)}
            className="min-w-16 px-3 py-1 rounded-lg text-white font-medium hover:bg-white/10 border border-transparent hover:border-white/10 transition cursor-text"
          >
            {row.maxMarks === "" ? "—" : row.maxMarks}
          </button>
        ),
    },
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

  return { columns };
}
