"use client";

import { Award } from "lucide-react";
import SuccessPopup from "./SuccessPopup";
import type { HubEvent } from "./shared";
import { useCreateHubState } from "./shared";
import { WorkshopAndCertificatePanel } from "./shared";
import { NamePositionStylePanel } from "./shared";
import { StudentSelectionPanel } from "./shared";

interface CreateHubProps {
  events: HubEvent[];
}

export default function CreateHub({ events }: CreateHubProps) {
  const {
    selectedEventId,
    setSelectedEventId,
    certificateFile,
    certificateUrl,
    namePosition,
    nameTextStyle,
    setNameTextStyle,
    students,
    selectedStudentIds,
    loadingStudents,
    uploadingCert,
    assigning,
    assignProgress,
    showPopup,
    setShowPopup,
    popupStage,
    error,
    previewImgSize,
    selectedEvent,
    handleCertUpload,
    toggleStudent,
    selectAll,
    deselectAll,
    createTemplateAndAssign,
    selectedCount,
    canAssign,
    handlePreviewClick,
    handlePreviewImgLoad,
  } = useCreateHubState({ events });

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 md:p-6 lg:p-8 backdrop-blur-xl shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center text-lime-400 shrink-0">
            <Award size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white">
              Certificate Hub
            </h3>
            <p className="text-xs sm:text-sm text-white/60 mt-0.5">
              Select a workshop, attach certificate, choose name position, then
              assign to enrolled students
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-8">
        <WorkshopAndCertificatePanel
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          uploadingCert={uploadingCert}
          certificateUrl={certificateUrl}
          certificateFile={certificateFile}
          onCertUpload={(e) => void handleCertUpload(e)}
        />

        {/* Right: Name Position & Enrolled Students */}
        <div className="xl:col-span-2 space-y-6">
          <NamePositionStylePanel
            certificateUrl={certificateUrl}
            previewImgSize={previewImgSize}
            namePosition={namePosition}
            onPreviewClick={handlePreviewClick}
            onPreviewImgLoad={handlePreviewImgLoad}
            nameTextStyle={nameTextStyle}
            onNameTextStyleChange={setNameTextStyle}
          />

          <StudentSelectionPanel
            selectedEvent={selectedEvent}
            loadingStudents={loadingStudents}
            students={students}
            selectedStudentIds={selectedStudentIds}
            onToggleStudent={toggleStudent}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            assigning={assigning}
            assignProgress={assignProgress}
            canAssign={canAssign}
            onAssign={() => void createTemplateAndAssign()}
            selectedCount={selectedCount}
          />
        </div>
      </div>

      <SuccessPopup
        open={showPopup}
        title={
          popupStage === "done"
            ? "Certificates Assigned"
            : "Generating Certificates..."
        }
        description={
          popupStage === "done"
            ? `${selectedCount} certificate(s) issued successfully`
            : "Applying name overlay and uploading..."
        }
        onClose={() => setShowPopup(false)}
      />
    </section>
  );
}
