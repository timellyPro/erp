"use client";

import PageHeader from "../common/PageHeader";

import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  ChevronDown,
  Download,
  Plus,
  User,
  Users,
  Search,
} from "lucide-react";

import AddClassPanel from "./classes-panels/AddClassPanel";
import AddSectionPanel from "./classes-panels/AddSectionPanel";
import AssignSectionPanel from "./classes-panels/AssignSectionPanel";
import UploadCsvPanel from "./classes-panels/UploadCsvPanel";
import ClassDetailsPanel from "./classes-panels/ClassDetailsPanel";
import EditClassPanel from "./classes-panels/EditClassPanel";
import DeleteClassPanel from "./classes-panels/DeleteClassPanel";
import SearchInput from "../common/SearchInput";
import InlinePanelTable from "../common/InlinePanelTable";
import TimellyLoader from "../common/TimellyLoader";
import StatCard from "./StatCard";
import { useClassesState, ClassMobileCard } from "./shared/classes";

export default function SchoolAdminClassesTab() {
  const {
    activeAction,
    setActiveAction,
    search,
    setSearch,
    activeRowId,
    setActiveRowId,
    panelMode,
    setPanelMode,
    mobileEdit,
    setMobileEdit,
    totalClasses,
    totalStudents,
    totalTeachers,
    avgSize,
    isLoading,
    isReportDownloading,
    loadError,
    setCurrentPage,
    savingClassId,
    refreshAfterMutation,
    filteredRows,
    totalPages,
    safePage,
    startIndex,
    endIndex,
    pagedRows,
    closePanel,
    tableColumns,
    handleReportClick,
    saveClassChanges,
    renderButton,
  } = useClassesState();

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

                {renderButton(
                  "assign",
                  ArrowRightLeft,
                  "Assign Section",
                  () => setActiveAction("assign")
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
        {activeAction === "assign" && (
          <AssignSectionPanel
            onCancel={() => setActiveAction("none")}
            onSuccess={() => {
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
          <TimellyLoader
            compact
            title="Loading classes"
            steps={["Class list", "Student totals", "Teachers"]}
          />
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
                  <TimellyLoader
                    compact
                    bare
                    title="Loading classes"
                    steps={["Classes", "Sections", "Teachers"]}
                  />
                </div>
              )}
              {pagedRows.map((row) => (
                <ClassMobileCard
                  key={row.id}
                  row={row}
                  isEditing={activeRowId === row.id && panelMode === "edit"}
                  mobileEdit={mobileEdit}
                  onMobileEditChange={setMobileEdit}
                  onStartEdit={() => {
                    setActiveRowId(row.id);
                    setPanelMode("edit");
                    setMobileEdit({
                      className: row.name,
                      section: row.section.replace("Section ", ""),
                    });
                  }}
                  onCloseEdit={closePanel}
                  onSave={async () => {
                    const className = mobileEdit?.className ?? row.name;
                    const section =
                      mobileEdit?.section ?? row.section.replace("Section ", "");
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
                  savingClassId={savingClassId}
                />
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
