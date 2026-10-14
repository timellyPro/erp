"use client";

import { GraduationCap, UserPlus } from "lucide-react";
import TimellyLoader from "../../common/TimellyLoader";
import { useAppointTeacherState } from "./shared";
import { AppointTeacherTable } from "./shared";
import { AppointTeacherMobileList } from "./shared";

type AppointTeacherProps = {
  schoolId?: string | null;
  /** After assign/remove class teacher, refresh the main teachers list / stats. */
  onRosterChange?: () => void;
};

/* ================= COMPONENT ================= */
export default function AppointTeacher({ schoolId, onRosterChange }: AppointTeacherProps) {
  const {
    classes,
    loading,
    selectedClassId,
    setSelectedClassId,
    selectedTeacherId,
    setSelectedTeacherId,
    assigning,
    removingId,
    editingClassId,
    appointments,
    classOptions,
    teacherOptions,
    handleAssign,
    handleEdit,
    handleRemove,
    cancelEdit,
  } = useAppointTeacherState({ schoolId, onRosterChange });

  return (
    <div className="w-full max-w-6xl mx-auto bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 text-white overflow-hidden">
      {/* HEADER */}
      <div className="p-4 sm:p-5 md:p-6">
        <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
          <GraduationCap className="text-lime-400 w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
          Appoint Class Teacher
        </h2>
        <p className="text-xs sm:text-sm text-white/60 mt-0.5 sm:mt-1">
          Assign one class teacher per class.
        </p>
      </div>

      {/* FORM */}
      <div className="border-t border-white/10 p-4 sm:p-5 md:p-6 bg-[#0F172A]/50">
        {loading && classes.length === 0 ? (
          <TimellyLoader
            compact
            bare
            title="Loading appointments"
            steps={["Classes", "Teachers", "Assignments"]}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:gap-4">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3"
            >
              <option value="" className="bg-gray-900 text-white">-- Select Class --</option>
              {classOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900 text-white" >
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="flex-1 border border-white/10 rounded-xl px-4 py-3  bg-black/20"
            >
              <option value="" className="bg-gray-900 text-white">-- Select Teacher --</option>
              {teacherOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleAssign}
              disabled={!selectedClassId || !selectedTeacherId || assigning}
              className="w-full sm:w-auto px-6 py-3 rounded-lg sm:rounded-xl font-semibold flex items-center justify-center gap-2 bg-lime-500 text-black hover:bg-lime-400 disabled:opacity-40 text-sm sm:text-base"
            >
              <UserPlus size={18} />
              {assigning
                ? editingClassId
                  ? "Updating..."
                  : "Assigning..."
                : editingClassId
                ? "Update"
                : "Assign"}
            </button>
          </div>
        )}

        {editingClassId && (
          <button
            onClick={cancelEdit}
            className="mt-3 text-xs underline text-white/60"
          >
            Cancel edit
          </button>
        )}
      </div>

      <AppointTeacherTable
        appointments={appointments}
        removingId={removingId}
        onEdit={handleEdit}
        onRemove={handleRemove}
      />

      <AppointTeacherMobileList
        appointments={appointments}
        removingId={removingId}
        onEdit={handleEdit}
        onRemove={handleRemove}
      />
    </div>
  );
}
