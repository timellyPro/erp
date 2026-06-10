"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "../common/TableLayout";
import StudentFilters from "./students/StudentFilters";
import UploadCsvPanel from "./students/UploadCsvPanel";
import AddStudentForm from "./students/AddStudentForm";
import StudentDetailsModal from "./students/StudentDetailsModal";
import DeleteConfirmation from "../common/DeleteConfirmation";
import { buildStudentColumns } from "./students/studentColumns";
import useStudentPage from "./students/useStudentPage";
import { getAge, toStudentForm } from "./students/utils";
import { ClassItem } from "./students/types";
import SuccessPopups from "../common/SuccessPopUps";
import StudentsHeader from "./students/StudentsHeader";
import StudentStats from "./students/StudentStats";

type Props = {
  classes?: ClassItem[];
  reload?: () => void;
};

const EMPTY_CLASSES: ClassItem[] = [];

export default function StudentsManagementPage({ classes, reload }: Props) {
  const stableClasses = classes ?? EMPTY_CLASSES;
  const page = useStudentPage({ classes: stableClasses, reload });
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 25;
  const listCount = page.tableLoading
    ? (page.totalCount ?? 0)
    : page.filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(page.filteredStudents.length / pageSize));
  const safePage = Math.min(tablePage, totalPages);
  const pagedStudents = useMemo(
    () =>
      page.filteredStudents.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
      ),
    [page.filteredStudents, safePage]
  );

  useEffect(() => {
    setTablePage(1);
  }, [
    page.searchQuery,
    page.selectedClass,
    page.selectedSection,
    page.statusFilter,
  ]);

  const columns = buildStudentColumns({
    onView: page.openView,
    onEdit: page.openEdit,
    onDelete: page.openDelete,
  });

  const tableTitle =
    page.statusFilter === "inactive"
      ? "Inactive Students"
      : page.statusFilter === "all"
        ? "All Students"
        : "Active Students";

  return (
    <main className="mx-auto w-full max-w-none xl:max-w-7xl space-y-6 md:space-y-8 text-white pb-12 px-0">
      <StudentsHeader
        activeCount={page.activeCount}
        inactiveCount={page.inactiveCount}
      />

      <StudentStats
        showing={listCount}
        totalCount={page.tableLoading ? null : page.totalCount}
        activeCount={page.activeCount}
        inactiveCount={page.inactiveCount}
        statusFilter={page.statusFilter}
      />

      <StudentFilters
        classOptions={page.filterClassOptions}
        sectionOptions={page.filterSectionOptions}
        selectedClass={page.selectedClass}
        onClassChange={page.setSelectedClass}
        selectedSection={page.selectedSection}
        onSectionChange={page.setSelectedSection}
        statusFilter={page.statusFilter}
        onStatusFilterChange={page.setStatusFilter}
        searchQuery={page.searchQuery}
        onSearchChange={page.setSearchQuery}
        filteredCount={listCount}
        showAddForm={page.showAddForm}
        onToggleAddForm={() => page.setShowAddForm((prev) => !prev)}
        onToggleUpload={() => page.setShowUploadPanel((prev) => !prev)}
        onDownloadReport={page.handleDownloadReport}
        exportDetailsLoading={page.exportingDetails}
      />

      {page.showUploadPanel && (
        <UploadCsvPanel
          uploadFile={page.uploadFile}
          onFileChange={page.setUploadFile}
          uploading={page.uploading}
          onCancel={() => page.setShowUploadPanel(false)}
          onUpload={page.handleUpload}
        />
      )}

      {page.editStudent && (
        <AddStudentForm
          form={page.editForm}
          errors={page.editErrors}
          classOptions={page.formClassOptions}
          sectionOptions={page.formSectionOptions}
          classesLoading={page.classesLoading}
          ageLabel={getAge(page.editForm.dob)}
          saving={page.editSaving}
          title={`Edit Student: ${page.editStudent.user?.name || page.editStudent.name || "Student"}`}
          subtitle="Update all available student fields"
          submitLabel="Save Changes"
          editMode
          onFieldChange={page.handleEditChange}
          onCancel={page.closeEdit}
          onReset={() => page.setEditForm(toStudentForm(page.editStudent!))}
          onSave={page.handleEditSave}
        />
      )}

      {page.showAddForm && (
        <AddStudentForm
          form={page.form}
          errors={page.errors}
          classOptions={page.formClassOptions}
          sectionOptions={page.formSectionOptions}
          classesLoading={page.classesLoading}
          ageLabel={getAge(page.form.dob)}
          saving={page.saving}
          onFieldChange={page.handleFormChange}
          onCancel={() => page.setShowAddForm(false)}
          onReset={page.handleResetForm}
          onSave={page.handleSaveStudent}
        />
      )}

      <DataTable
        columns={columns}
        data={pagedStudents}
        loading={page.tableLoading}
        timellyLoader
        emptyText="No students found"
        tableTitle={`${tableTitle} (${listCount.toLocaleString()})`}
        tableSubtitle={
          page.selectedClass
            ? `Class ${page.selectedClass}${page.selectedSection ? ` · ${page.selectedSection}` : ""}`
            : "Select a class to load students faster"
        }
        showMobile={false}
        scrollableWide
        stickyFirstColumn
        stickyLastColumn
        pagination={{
          page: safePage,
          totalPages,
          onChange: setTablePage,
        }}
      />

      {page.viewStudent && (
        <StudentDetailsModal
          student={page.viewStudent}
          onClose={page.closeView}
          onEdit={() => {
            if (!page.viewStudent) return;
            page.openEdit(page.viewStudent);
            page.closeView();
          }}
        />
      )}

      <DeleteConfirmation
        isOpen={!!page.deleteStudent}
        userName={
          page.deleteStudent?.user?.name ||
          page.deleteStudent?.name ||
          "this student"
        }
        onCancel={page.closeDelete}
        onConfirm={async () => {
          await page.handleDelete();
        }}
      />

      <SuccessPopups
        open={page.showSuccess}
        title="Student Added Successfully"
        description="The student has been added and assigned to the class."
        onClose={() => page.setShowSuccess(false)}
      />
    </main>
  );
}
