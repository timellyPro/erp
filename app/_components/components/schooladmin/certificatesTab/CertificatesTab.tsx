"use client";

import type { CertificateRequestListItem } from "../Certificates";
import TimellyLoader from "../../common/TimellyLoader";
import type { TabStatus } from "./shared";
import { useCertificatesTabState } from "./shared";
import { CertificatesMobileCards } from "./shared";
import { CertificatesTableMd } from "./shared";
import { CertificatesTableLg } from "./shared";
import { ApproveCertificateModal } from "./shared";

interface CertificatesTabProps {
  certificateRequests: CertificateRequestListItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRequestPatch?: (id: string, patch: Partial<CertificateRequestListItem>) => void;
}

export default function CertificatesTab({
  certificateRequests,
  loading,
  error,
  onRefresh,
  onRequestPatch,
}: CertificatesTabProps) {
  const {
    activeTab,
    setActiveTab,
    actingId,
    approvingId,
    selectedFile,
    uploadingFile,
    showApproveModal,
    fileInputRef,
    filtered,
    count,
    handleFileSelect,
    handleApprove,
    openApproveModal,
    closeApproveModal,
    handleReject,
  } = useCertificatesTabState({ certificateRequests, onRefresh, onRequestPatch });

  if (loading && certificateRequests.length === 0) {
    return (
      <TimellyLoader
        compact
        title="Loading certificates"
        steps={["Requests", "Students", "Approvals"]}
      />
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-red-400">
        {error}
        <button
          onClick={onRefresh}
          className="mt-3 text-sm text-lime-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl shadow-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-3 text-[11px] sm:text-sm font-medium">
          {(["pending", "approved", "rejected"] as TabStatus[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 transition relative ${
                activeTab === tab
                  ? "text-lime-400"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {tab === "pending" && `Pending (${count("pending")})`}
              {tab === "approved" && `Approved (${count("approved")})`}
              {tab === "rejected" && `Rejected (${count("rejected")})`}
              {activeTab === tab && (
                <span className="absolute left-0 bottom-0 w-full h-[2px] bg-lime-400" />
              )}
            </button>
          ))}
        </div>

        <CertificatesMobileCards
          filtered={filtered}
          activeTab={activeTab}
          actingId={actingId}
          approvingId={approvingId}
          onOpenApproveModal={openApproveModal}
          onReject={(id) => void handleReject(id)}
        />

        <CertificatesTableMd
          filtered={filtered}
          activeTab={activeTab}
          actingId={actingId}
          approvingId={approvingId}
          onOpenApproveModal={openApproveModal}
          onReject={(id) => void handleReject(id)}
        />

        <CertificatesTableLg
          filtered={filtered}
          activeTab={activeTab}
          actingId={actingId}
          approvingId={approvingId}
          onOpenApproveModal={openApproveModal}
          onReject={(id) => void handleReject(id)}
        />
      </div>

      {showApproveModal && approvingId && (
        <ApproveCertificateModal
          approvingId={approvingId}
          fileInputRef={fileInputRef}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          actingId={actingId}
          uploadingFile={uploadingFile}
          onApprove={(id) => void handleApprove(id)}
          onClose={closeApproveModal}
        />
      )}
    </div>
  );
}
