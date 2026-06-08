"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Clock, CheckCircle, FileText, X } from "lucide-react";
import StatCard from "../../common/statCard";
import CertificateRequestCard from "./CertificateRequestCard";
import CertificatesCard from "./CertificatesCard";
import ApprovedCertificates from "./ApprovedCertificates";
import ParentTimellyLoader from "../ParentTimellyLoader";

interface CertificateRequest {
  id: string;
  certificateType: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt?: string;
  issuedDate: string | null;
  tcDocumentUrl: string | null;
  student: {
    user: { name: string | null };
  };
}

interface Certificate {
  id: string;
  title: string;
  description: string | null;
  issuedDate: string;
  certificateUrl: string | null;
  student: {
    user: { name: string | null };
  };
}

export default function ParentCertificatesTab() {
  const { data: session } = useSession();
  const [certificateRequests, setCertificateRequests] = useState<CertificateRequest[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [certificateType, setCertificateType] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const certificateTypes = [
    { value: "TRANSFER", label: "Transfer Certificate (TC)" },
    { value: "BONAFIDE", label: "Bonafide Certificate" },
    { value: "CHARACTER", label: "Character Certificate" },
    { value: "CONDUCT", label: "Conduct Certificate" },
    { value: "MIGRATION", label: "Migration Certificate" },
    { value: "LEAVING", label: "Leaving Certificate" },
    { value: "PROVISIONAL", label: "Provisional Certificate" },
    { value: "ATTENDANCE", label: "Attendance Certificate" },
    { value: "MEDICAL", label: "Medical Certificate" },
    { value: "SPORTS", label: "Sports Certificate" },
    { value: "ACHIEVEMENT", label: "Achievement Certificate" },
    { value: "OTHER", label: "Other" },
  ];

  const fetchData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      let certReqRes = await fetch("/api/tc/list", { credentials: "include" });
      if (certReqRes.status === 404) {
        certReqRes = await fetch("/api/certificates/requests/list", { credentials: "include" });
      }
      if (certReqRes.ok) {
        const certReqData = await certReqRes.json();
        const requests = certReqData.certificateRequests || certReqData.tcs || [];
        setCertificateRequests(requests);
        if (requests?.[0]?.student?.user?.name) {
          setStudentName((prev) => prev || requests[0].student.user.name || "");
        }
      }

      const certRes = await fetch("/api/certificates/list", { credentials: "include" });
      if (certRes.ok) {
        const certData = await certRes.json();
        setCertificates(certData.certificates || []);
        if (certData.certificates?.[0]?.student?.user?.name) {
          setStudentName((prev) => prev || certData.certificates[0].student.user.name || "");
        }
      }

      if (session.user.name) {
        setStudentName((prev) => prev || session.user.name || "");
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequestCertificate = async () => {
    if (!certificateType) {
      setMessage({ text: "Please select a certificate type", type: "error" });
      return;
    }
    if (!requestReason.trim()) {
      setMessage({ text: "Please provide a reason", type: "error" });
      return;
    }

    setRequestLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/certificates/requests/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ certificateType, reason: requestReason }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.message || "Failed to submit request", type: "error" });
        return;
      }

      setMessage({ text: "Certificate request submitted successfully!", type: "success" });
      setCertificateType("");
      setRequestReason("");
      setShowRequestModal(false);
      await fetchData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ text: "Something went wrong. Please try again.", type: "error" });
    } finally {
      setRequestLoading(false);
    }
  };

  const pendingRequests = certificateRequests.filter((req) => req.status === "PENDING");
  const approvedRequests = certificateRequests.filter((req) => req.status === "APPROVED");
  const rejectedRequests = certificateRequests.filter((req) => req.status === "REJECTED");
  const totalIssued = certificates.length + approvedRequests.length;

  // Merge issued certificates (Certificate table) + approved requests (TransferCertificate) so "Approved Certificates" shows both
  const approvedCertificatesToShow = useMemo(() => {
    const fromIssued: Certificate[] = certificates;
    const fromRequests: Certificate[] = approvedRequests.map((req) => ({
      id: req.id,
      title: req.certificateType || "Certificate",
      description: req.reason,
      issuedDate: req.issuedDate || req.createdAt || new Date().toISOString(),
      certificateUrl: req.tcDocumentUrl,
      student: req.student,
    }));
    return [...fromIssued, ...fromRequests];
  }, [certificates, approvedRequests]);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  const daysSince = (iso: string | null | undefined) => {
    if (!iso) return 0;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 0;
    const diffMs = Date.now() - d.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const addDays = (iso: string, days: number) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-bold text-base md:text-lg">Certificate Requests</h4>
            <div className="text-xs text-gray-400">
              Pending: <span className="text-orange-400 font-semibold">{pendingRequests.length}</span>{" "}
              • Approved: <span className="text-lime-400 font-semibold">{approvedRequests.length}</span>{" "}
              • Rejected: <span className="text-red-400 font-semibold">{rejectedRequests.length}</span>
            </div>
          </div>

          {loading ? (
            <ParentTimellyLoader preset="certificates" compact className="w-full" />
          ) : certificateRequests.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">No certificate requests yet.</div>
          ) : (
            <div className="space-y-6">
              {/* Pending */}
              {pendingRequests.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold text-orange-300">Pending</h5>
                  {pendingRequests.map((req) => {
                    const elapsedDays = daysSince(req.createdAt);
                    const expected = addDays(req.createdAt, 7);
                    const progress = Math.min(100, Math.round((elapsedDays / 7) * 100));
                    return (
                      <CertificateRequestCard
                        key={req.id}
                        title={req.certificateType || "Certificate Request"}
                        purpose={req.reason || "-"}
                        requestId={req.id.slice(0, 8).toUpperCase()}
                        status="processing"
                        requestDate={formatDate(req.createdAt)}
                        secondDateLabel="Expected by"
                        secondDate={formatDate(expected)}
                        daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                        progress={progress}
                        downloadUrl={null}
                      />
                    );
                  })}
                </div>
              )}

              {/* Approved */}
              {approvedRequests.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold text-lime-300">Approved</h5>
                  {approvedRequests.map((req) => {
                    const elapsedDays = daysSince(req.createdAt);
                    const approvedOn = req.issuedDate || req.updatedAt || req.createdAt;
                    return (
                      <CertificateRequestCard
                        key={req.id}
                        title={req.certificateType || "Certificate Request"}
                        purpose={req.reason || "-"}
                        requestId={req.id.slice(0, 8).toUpperCase()}
                        status="ready"
                        requestDate={formatDate(req.createdAt)}
                        secondDateLabel="Approved on"
                        secondDate={formatDate(approvedOn)}
                        daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                        downloadUrl={req.tcDocumentUrl}
                      />
                    );
                  })}
                </div>
              )}

              {/* Rejected */}
              {rejectedRequests.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold text-red-300">Rejected</h5>
                  {rejectedRequests.map((req) => {
                    const elapsedDays = daysSince(req.createdAt);
                    const rejectedOn = req.updatedAt || req.createdAt;
                    return (
                      <CertificateRequestCard
                        key={req.id}
                        title={req.certificateType || "Certificate Request"}
                        purpose={req.reason || "-"}
                        requestId={req.id.slice(0, 8).toUpperCase()}
                        status="rejected"
                        requestDate={formatDate(req.createdAt)}
                        secondDateLabel="Rejected on"
                        secondDate={formatDate(rejectedOn)}
                        daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                        downloadUrl={null}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* APPROVED CERTIFICATES (issued + approved requests) */}
        <ApprovedCertificates certificates={approvedCertificatesToShow} />

        {/* REQUEST CERTIFICATE MODAL */}
        {showRequestModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => !requestLoading && setShowRequestModal(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl bg-[#0B1B34] border border-white/10 shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-bold text-white">Request Certificate</h3>
                <button
                  type="button"
                  onClick={() => !requestLoading && setShowRequestModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                className="flex flex-col flex-1 overflow-y-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRequestCertificate();
                }}
              >
                <div className="p-6 space-y-4">
                  {message && (
                    <div
                      className={`px-4 py-3 rounded-xl text-sm ${
                        message.type === "success"
                          ? "bg-lime-400/20 text-lime-400 border border-lime-400/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}
                    >
                      {message.text}
                    </div>
                  )}
                  <div>
                    <label htmlFor="certificate-type" className="block text-sm font-medium text-gray-400 mb-2">
                      Certificate type <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="certificate-type"
                      value={certificateType}
                      onChange={(e) => setCertificateType(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#A3E635]/50 focus:border-[#A3E635]"
                    >
                      <option value="" className="text-gray-700 bg-white">Select type</option>
                      {certificateTypes.map((opt) => (
                        <option key={opt.value} value={opt.value} className="text-white bg-gray-900">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="request-reason" className="block text-sm font-medium text-gray-400 mb-2">
                      Reason <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="request-reason"
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      required
                      rows={4}
                      placeholder="Brief reason for requesting this certificate..."
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#A3E635]/50 focus:border-[#A3E635] resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-white/10 bg-[#0F172A]/80">
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    disabled={requestLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-gray-300 hover:bg-white/15 disabled:opacity-50 font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={requestLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-[#A3E635] text-black font-semibold hover:bg-[#A3E635]/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    {requestLoading ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


