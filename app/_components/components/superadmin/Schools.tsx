"use client";

import { Search } from "lucide-react";
import { useMemo } from "react";
import PageHeader from "../common/PageHeader";
import Spinner from "../common/Spinner";
import SearchInput from "../common/SearchInput";
import TableLayout from "../common/TableLayout";
import BackupEmailPanel from "./BackupEmailPanel";
import { useSchoolsState, buildSchoolsColumns, SchoolMobileCard, SchoolsPagination, DeleteSchoolModal } from "./shared/schools";

export interface SchoolRow {
  slNo: number;
  id: string;
  name: string;
  address: string;
  location: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  turnover: number;
  admin: {
    id: string;
    name: string;
    email: string;
    mobile: string;
    role: string;
    photoUrl?: string | null;
  } | null;
}

type SchoolsProps = {
  /** "remove" tab: same list, copy emphasizes permanent school deletion. */
  variant?: "default" | "remove";
};

export default function Schools({ variant = "default" }: SchoolsProps) {
  const {
    schools,
    loading,
    error,
    search,
    setSearch,
    page,
    setPage,
    modalSchool,
    confirmName,
    setConfirmName,
    deleteBusy,
    deleteError,
    exportingSchoolId,
    totalPages,
    paginatedSchools,
    handleDownloadFeesBackup,
    handleConfirmDeleteSchool,
    openDeleteModal,
    closeDeleteModal,
  } = useSchoolsState();

  const columns = useMemo(
    () =>
      buildSchoolsColumns({
        deleteBusy,
        exportingSchoolId,
        onDownload: (s) => void handleDownloadFeesBackup(s),
        onRequestDelete: openDeleteModal,
      }),
    [deleteBusy, exportingSchoolId, handleDownloadFeesBackup, openDeleteModal]
  );

  return (
    <main className="flex-1 min-w-0 w-full max-w-[1600px] mx-auto flex flex-col">
      <div className="w-full min-h-0 space-y-4 sm:space-y-6">
        <PageHeader
          title={variant === "remove" ? "Remove schools" : "Schools"}
          subtitle={
            variant === "remove"
              ? "Delete a school only after you export anything you need. Use Fees backup on each row for a full Excel report."
              : "Schools, admins, students, turnover — download full fees backup (Excel) per school"
          }
          className="rounded-2xl sm:rounded-3xl"
          rightSlot={
            <div className="w-full md:max-w-sm lg:max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                icon={Search}
                iconPosition="right"
                placeholder="Search school, admin, email…"
                variant="glass"
              />
            </div>
          }
        />

        {variant === "default" && !loading && (
          <BackupEmailPanel
            schools={schools.map((s) => ({ id: s.id, name: s.name }))}
          />
        )}

        {error && (
          <div className="text-red-400 text-sm py-1 px-1" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Mobile & tablet: cards */}
            <div className="lg:hidden space-y-3">
              {paginatedSchools.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-12 text-center text-sm text-white/50">
                  No schools match your search.
                </div>
              ) : (
                paginatedSchools.map((s) => (
                  <SchoolMobileCard
                    key={s.id}
                    school={s}
                    exportingSchoolId={exportingSchoolId}
                    deleteBusy={deleteBusy}
                    onDownload={(school) => void handleDownloadFeesBackup(school)}
                    onRequestDelete={openDeleteModal}
                  />
                ))
              )}
              <SchoolsPagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>

            {/* Desktop: table */}
            <div className="hidden lg:block space-y-4">
              <TableLayout
                columns={columns}
                data={paginatedSchools}
                emptyText="No schools match your search."
                rowKey={(row) => row.id}
                tableClassName="table-auto w-full min-w-[1000px]"
                tdClassName="whitespace-normal align-middle"
                pagination={{
                  page,
                  totalPages,
                  onChange: setPage,
                }}
              />
            </div>
          </>
        )}
      </div>

      {modalSchool && (
        <DeleteSchoolModal
          modalSchool={modalSchool}
          confirmName={confirmName}
          setConfirmName={setConfirmName}
          deleteBusy={deleteBusy}
          deleteError={deleteError}
          onCancel={closeDeleteModal}
          onConfirm={() => void handleConfirmDeleteSchool()}
        />
      )}
    </main>
  );
}
