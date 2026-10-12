"use client";

import { Download } from "lucide-react";
import PageHeader from "../common/PageHeader";
import AppointTeacher from "./teachersTab/AppointTeacher";
import TeachersList from "./teachersTab/TeachersList";
import EditTeacher from "./teachersTab/EditTeacher";
import { useTeachersTabState, TeacherAttendanceStatCards, DailyAttendanceCard } from "./shared/teachersTab";

const SchoolAdminTeacherTab = () => {
  const {
    schoolId,
    searchTerm,
    setSearchTerm,
    teachers,
    teachersLoading,
    teachersRevalidating,
    editingTeacher,
    setEditingTeacher,
    attendanceDate,
    setAttendanceDate,
    attendanceMap,
    attendanceLoading,
    saveAttendanceLoading,
    pdfLoading,
    refreshTeachers,
    filteredTeachers,
    safePage,
    totalPages,
    pagedTeachers,
    setPage,
    handleDelete,
    handleEditTeacher,
    handleSaveTeacher,
    setTeacherAttendance,
    markAllPresent,
    saveAttendance,
    presentCount,
    onLeaveCount,
    lateCount,
    absentCount,
    overallPct,
    downloadReportAsPdf,
  } = useTeachersTabState();

  return (
    <div className="w-full max-w-screen-2xl mx-auto space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden px-2 sm:px-0 pb-20 lg:pb-0">

      <PageHeader
        title="Teachers"
        subtitle={
          teachersRevalidating
            ? "Overview of teaching staff — updating…"
            : "Overview of teaching staff, attendance, and assignments"
        }
        transparent
        rightSlot={
          <button
            type="button"
            onClick={() => void downloadReportAsPdf()}
            disabled={pdfLoading || teachers.length === 0}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium transition-all text-gray-300 disabled:opacity-50"
          >
            <Download size={16} /> {pdfLoading ? "Generating…" : "Download PDF"}
          </button>
        }
      />

      <TeacherAttendanceStatCards
        presentCount={presentCount}
        teachersCount={teachers.length}
        onLeaveCount={onLeaveCount}
        lateCount={lateCount}
        absentCount={absentCount}
      />

      <DailyAttendanceCard
        attendanceDate={attendanceDate}
        onAttendanceDateChange={setAttendanceDate}
        overallPct={overallPct}
        presentCount={presentCount}
        teachersCount={teachers.length}
        onMarkAllPresent={markAllPresent}
        teachersLoading={teachersLoading}
        teachers={teachers}
        attendanceMap={attendanceMap}
        attendanceLoading={attendanceLoading}
        onTeacherAttendanceChange={setTeacherAttendance}
        saveAttendanceLoading={saveAttendanceLoading}
        onSaveAttendance={() => void saveAttendance()}
      />

      {/* Main Table & Mobile Card Section */}
      <div className="grid gap-10
      ">
      <div className="w-full min-w-0 overflow-hidden">
        <TeachersList
          teachersLoading={teachersLoading && teachers.length === 0}
          filteredTeachers={filteredTeachers}
          pagedTeachers={pagedTeachers}
          attendanceDate={attendanceDate}
          overallPct={overallPct}
          presentCount={presentCount}
          teachersCount={teachers.length}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          page={safePage}
          totalPages={totalPages}
          setPage={setPage}
          onDelete={handleDelete}
          onEditTeacher={handleEditTeacher}
        />
      </div>

      {editingTeacher && (
        <EditTeacher
          teacher={editingTeacher}
          onClose={() => setEditingTeacher(null)}
          onSave={(t) => {
            handleSaveTeacher(t);
            setEditingTeacher(null);
            refreshTeachers();
          }}
        />
      )}


      {/* ================= Teachers List ================= */}

      <div className="w-full min-w-0">
        <AppointTeacher
          schoolId={schoolId}
          onRosterChange={() => {
            refreshTeachers();
          }}
        />
      </div>
      </div>
    </div>
  );
};
export default SchoolAdminTeacherTab;
