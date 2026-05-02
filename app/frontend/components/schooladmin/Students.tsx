"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "../common/TableLayout";
import PageHeader from "../common/PageHeader";
import StudentFilters from "./students/StudentFilters";
import UploadCsvPanel from "./students/UploadCsvPanel";
import AddStudentForm from "./students/AddStudentForm";
import StudentDetailsModal from "./students/StudentDetailsModal";
import StudentMobileCard from "./students/StudentMobileCard";
import DeleteConfirmation from "../common/DeleteConfirmation";
import { buildStudentColumns } from "./students/studentColumns";
import useStudentPage from "./students/useStudentPage";
import { getAge, toStudentForm } from "./students/utils";
import { ClassItem } from "./students/types";
import SuccessPopups from "../common/SuccessPopUps";
import Spinner from "../common/Spinner";

type Props = {
  classes?: ClassItem[];
  reload?: () => void;
};

const EMPTY_CLASSES: ClassItem[] = [];

export default function StudentsManagementPage({ classes, reload }: Props) {
  const stableClasses = classes ?? EMPTY_CLASSES;
  const page = useStudentPage({ classes: stableClasses, reload });
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(
    1,
    Math.ceil(page.filteredStudents.length / pageSize)
  );
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
  }, [page.searchQuery, page.selectedClass, page.selectedSection]);

  const columns = buildStudentColumns({
    onView: page.openView,
    onEdit: page.openEdit,
    onDelete: page.openDelete,
  });

  return (
    <>
      <PageHeader
        title="Students Management"
        subtitle="Manage all student records"
        className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 md:p-6 shadow-lg border border-white/10"
      />
      <div className="mx-auto w-full max-w-none xl:max-w-7xl space-y-4 md:space-y-6 text-gray-200 pb-12">
        <StudentFilters
          classOptions={page.filterClassOptions}
          sectionOptions={page.filterSectionOptions}
          selectedClass={page.selectedClass}
          onClassChange={page.setSelectedClass}
          selectedSection={page.selectedSection}
          onSectionChange={page.setSelectedSection}
          searchQuery={page.searchQuery}
          onSearchChange={page.setSearchQuery}
          showAddForm={page.showAddForm}
          onToggleAddForm={() => page.setShowAddForm((prev) => !prev)}
          onToggleUpload={() => page.setShowUploadPanel((prev) => !prev)}
          onDownloadReport={page.handleDownloadReport}
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

        <div className="md:hidden space-y-3">
          {page.tableLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <Spinner size={26} label="Loading..." />
            </div>
          ) : pagedStudents.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
              No students found
            </div>
          ) : (
            pagedStudents.map((student, index) => (
              <StudentMobileCard
                key={student.id}
                student={student}
                index={index}
                onView={page.openView}
                onEdit={page.openEdit}
                onDelete={page.openDelete}
              />
            ))
          )}

          {totalPages > 1 && !page.tableLoading && (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-xs text-white/60">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTablePage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setTablePage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={pagedStudents}
            loading={page.tableLoading}
            emptyText="No students found"
            tableTitle={`All Students (${page.filteredStudents.length})`}
            tableSubtitle={
              page.selectedClass
                ? `Class ${page.selectedClass}${page.selectedSection ? ` ${page.selectedSection}` : ""}`
                : undefined
            }
            showMobile={false}
            pagination={{
              page: safePage,
              totalPages,
              onChange: setTablePage,
            }}
          />
        </div>
      </div>

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

    </>
  );
}
