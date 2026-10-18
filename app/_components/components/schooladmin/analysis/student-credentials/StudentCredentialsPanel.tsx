"use client";

import { StudentCredentialsLoader } from "../StudentCredentialsLoader";
import StudentCredentialsFilters from "./StudentCredentialsFilters";
import StudentCredentialsHeader from "./StudentCredentialsHeader";
import StudentCredentialsMismatchAlert from "./StudentCredentialsMismatchAlert";
import { StudentCredentialsTable } from "./StudentCredentialsTable";
import { useStudentCredentialsPage } from "./useStudentCredentialsPage";

export default function StudentCredentialsPanel() {
  const page = useStudentCredentialsPage();

  return (
    <div className="mt-0 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-md sm:rounded-2xl sm:p-5 md:p-6">
      <StudentCredentialsHeader
        revalidating={page.revalidating}
        initialLoading={page.initialLoading}
        resetting={page.resetting}
        exporting={page.exporting}
        hasRows={page.filteredRows.length > 0}
        onReset={() => void page.handleResetPasswords()}
        onDownload={(format) => void page.handleDownload(format)}
      />

      {page.truncated ? (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 sm:text-sm">
          Only the first 5,000 students are shown. Pick a class or section to see the rest.
        </p>
      ) : null}

      {!page.initialLoading ? (
        <StudentCredentialsMismatchAlert mismatchCount={page.mismatchCount} />
      ) : null}

      <StudentCredentialsFilters
        classOptions={page.classOptions}
        sectionOptions={page.sectionOptions}
        selectedClass={page.selectedClass}
        selectedSection={page.selectedSection}
        searchQuery={page.searchQuery}
        classesLoading={page.classesLoading}
        onClassChange={page.setSelectedClass}
        onSectionChange={page.setSelectedSection}
        onSearchChange={page.setSearchQuery}
      />

      {page.initialLoading ? (
        <StudentCredentialsLoader />
      ) : (
        <StudentCredentialsTable
          rows={page.pagedRows}
          summaryLabel={page.summaryLabel}
          page={page.pageSafe}
          totalPages={page.totalPages}
          onPageChange={page.setPage}
          onResetOne={(row) => void page.handleResetOne(row)}
          resettingId={page.resettingId}
          busy={page.resetting}
        />
      )}
    </div>
  );
}
