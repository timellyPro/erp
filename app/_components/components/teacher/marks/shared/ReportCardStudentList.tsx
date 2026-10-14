import type { StudentOption } from "./reportCardTypes";

export function ReportCardStudentList({
  filteredStudents,
  students,
  classesLoading,
  studentsLoading,
  selectedStudentId,
  onSelectStudent,
}: {
  filteredStudents: StudentOption[];
  students: StudentOption[];
  classesLoading: boolean;
  studentsLoading: boolean;
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
}) {
  return (
    <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/[0.02]">
        <h3 className="font-bold text-white text-sm">
          Students{" "}
          <span className="text-white/40 font-normal">
            ({filteredStudents.length})
          </span>
        </h3>
      </div>
      <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
        {classesLoading || studentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">
            {students.length === 0
              ? "No students found"
              : "No matching students"}
          </p>
        ) : (
          filteredStudents.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectStudent(s.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/5 ${
                selectedStudentId === s.id
                  ? "bg-lime-400/10 border-l-2 border-lime-400"
                  : "border-l-2 border-transparent"
              }`}
            >
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&size=36&background=4ade80&color=fff`}
                alt={s.name}
                className="w-9 h-9 rounded-full flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {s.name}
                </p>
                <p className="text-xs text-white/40">
                  Roll: {s.rollNo ?? "—"}
                </p>
              </div>
              {selectedStudentId === s.id && (
                <div className="ml-auto w-2 h-2 rounded-full bg-lime-400 flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
