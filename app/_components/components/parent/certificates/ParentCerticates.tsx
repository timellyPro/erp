"use client";

import { Clock, CheckCircle, FileText } from "lucide-react";
import StatCard from "../../common/statCard";
import CertificatesCard from "./CertificatesCard";
import ApprovedCertificates from "./ApprovedCertificates";
import ParentTimellyLoader from "../ParentTimellyLoader";
import { useParentCertificatesState } from "./shared";
import { CertificateRequestsSection } from "./shared";
import { RequestCertificateModal } from "./shared";

export default function ParentCertificatesTab() {
  const {
    certificateRequests,
    certificates,
    loading,
    studentName,
    showRequestModal,
    setShowRequestModal,
    certificateType,
    setCertificateType,
    requestReason,
    setRequestReason,
    requestLoading,
    message,
    handleRequestCertificate,
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    totalIssued,
    approvedCertificatesToShow,
  } = useParentCertificatesState();

  if (loading && certificateRequests.length === 0 && certificates.length === 0) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
        <ParentTimellyLoader preset="certificates" className="w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="space-y-6 md:space-y-8 animate-fadeIn">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg w-full md:w-auto p-4 md:p-6 lg:p-8">

          <div>
            <h3 className="text-lg md:text-xl lg:text-3xl font-bold text-white">
              Certificates
            </h3>
            <p className="text-xs md:text-sm lg:text-base text-gray-400 mt-1">
              Manage certificates for {studentName || "Student"}
            </p>
          </div>

          <button
            onClick={() => setShowRequestModal(true)}
            className="w-full md:w-auto px-4 md:px-6 py-3 md:py-4 bg-[#A3E635] text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
          >
            <FileText className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-sm md:text-base">Request Certificate</span>
          </button>

        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard className="relative h-24 md:h-28 p-4 md:p-6 rounded-2xl">
            <div>
              <span className="text-xs uppercase text-white/70">Processing</span>
              <div className="text-xl md:text-2xl font-semibold text-white">
                {pendingRequests.length}
              </div>
            </div>
            <Clock className="absolute top-4 right-4 w-5 h-5 text-orange-400" />
          </StatCard>

          <StatCard className="relative h-24 md:h-28 p-4 md:p-6 rounded-2xl">
            <div>
              <span className="text-xs uppercase text-white/70">Total Issued</span>
              <div className="text-xl md:text-2xl font-semibold text-white">
                {totalIssued}
              </div>
            </div>
            <CheckCircle className="absolute top-4 right-4 w-5 h-5 text-lime-400" />
          </StatCard>
        </div>

        {/* CERTIFICATES */}
        <CertificatesCard />

        {/* CERTIFICATE REQUESTS */}
        <CertificateRequestsSection
          loading={loading}
          certificateRequests={certificateRequests}
          pendingRequests={pendingRequests}
          approvedRequests={approvedRequests}
          rejectedRequests={rejectedRequests}
        />

        {/* APPROVED CERTIFICATES (issued + approved requests) */}
        <ApprovedCertificates certificates={approvedCertificatesToShow} />

        {/* REQUEST CERTIFICATE MODAL */}
        {showRequestModal && (
          <RequestCertificateModal
            requestLoading={requestLoading}
            onClose={() => setShowRequestModal(false)}
            message={message}
            certificateType={certificateType}
            setCertificateType={setCertificateType}
            requestReason={requestReason}
            setRequestReason={setRequestReason}
            onSubmit={handleRequestCertificate}
          />
        )}
      </div>
    </div>
  );
}
