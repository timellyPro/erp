"use client";

import { useState, useRef } from "react";
import { CheckCircle, XCircle, Download, Loader2, Upload, File } from "lucide-react";
import type { CertificateRequestListItem } from "../Certificates";
import { uploadImage } from "@/app/frontend/utils/upload";
import TimellyLoader from "../../common/TimellyLoader";

type TabStatus = "pending" | "approved" | "rejected";

const STATUS_MAP: Record<string, TabStatus> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function classNameDisplay(req: CertificateRequestListItem): string {
  const c = req.student?.class;
  if (!c) return "—";
  return c.section ? `${c.name}-${c.section}` : c.name;
}

function getCertificateTypeLabel(type: string | null | undefined): string {
  if (!type) return "Certificate";
  
  // Map certificate type values to their display labels (matching parent component dropdown)
  const typeMap: Record<string, string> = {
    "TRANSFER": "Transfer Certificate (TC)",
    "BONAFIDE": "Bonafide Certificate",
    "CHARACTER": "Character Certificate",
    "CONDUCT": "Conduct Certificate",
    "MIGRATION": "Migration Certificate",
    "LEAVING": "Leaving Certificate",
    "PROVISIONAL": "Provisional Certificate",
    "ATTENDANCE": "Attendance Certificate",
    "MEDICAL": "Medical Certificate",
    "SPORTS": "Sports Certificate",
    "ACHIEVEMENT": "Achievement Certificate",
    "OTHER": "Other",
  };
  
  // Check exact match first (case-sensitive)
  if (typeMap[type]) {
    return typeMap[type];
  }
  
  // Check case-insensitive match
  const upperType = type.toUpperCase();
  if (typeMap[upperType]) {
    return typeMap[upperType];
  }
  
  // If no match found, return the original type or default
  return type || "Certificate";
}

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
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = certificateRequests.filter(
    (t) => STATUS_MAP[t.status] === activeTab
  );

  const count = (status: TabStatus) =>
    certificateRequests.filter((t) => STATUS_MAP[t.status] === status).length;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        alert("Invalid file type. Please upload PDF, DOC, DOCX, or image files.");
        return;
      }
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        alert("File size must be less than 10MB.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      let documentUrl: string | undefined;
      
      // Upload file first if selected
      if (selectedFile) {
        setUploadingFile(true);
        try {
          documentUrl = await uploadImage(selectedFile, "certificates");
        } catch (uploadError) {
          alert(uploadError instanceof Error ? uploadError.message : "File upload failed");
          setUploadingFile(false);
          setActingId(null);
          return;
        } finally {
          setUploadingFile(false);
        }
      }

      // Approve with document URL
      const res = await fetch(`/api/certificates/requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentUrl }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Approve failed");
      
      // Reset state
      setSelectedFile(null);
      setShowApproveModal(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      onRequestPatch?.(id, {
        status: "APPROVED",
        issuedDate: new Date().toISOString(),
        tcDocumentUrl: documentUrl ?? null,
      });
      onRefresh();
    } catch (e: any) {
      alert(e?.message || "Failed to approve");
    } finally {
      setActingId(null);
      setApprovingId(null);
    }
  };

  const openApproveModal = (id: string) => {
    setApprovingId(id);
    setShowApproveModal(true);
    setSelectedFile(null);
  };

  const closeApproveModal = () => {
    setShowApproveModal(false);
    setApprovingId(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReject = async (id: string) => {
    setApprovingId(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/certificates/requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Reject failed");
      onRequestPatch?.(id, { status: "REJECTED" });
      onRefresh();
    } catch (e: any) {
      alert(e?.message || "Failed to reject");
    } finally {
      setActingId(null);
    }
  };

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

        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-white/60 py-6 text-center">
              No {activeTab} requests
            </p>
          ) : (
            filtered.map((row) => (
              <div
                key={row.id}
                className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {row.student?.user?.name ?? "—"}
                    </div>
                    <div className="text-xs text-white/70">
                      {getCertificateTypeLabel(row.certificateType)}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px]">
                    {classNameDisplay(row)}
                  </span>
                </div>
                <div className="text-xs text-white/70 space-y-1">
                  <div>
                    <span className="text-white/50">Request ID: </span>
                    {`CR${row.id.slice(-6).toUpperCase()}`}
                  </div>
                  <div>
                    <span className="text-white/50">Certificate Type: </span>
                    {getCertificateTypeLabel(row.certificateType)}
                  </div>
                  <div>
                    <span className="text-white/50">Purpose: </span>
                    {row.reason || "—"}
                  </div>
                  <div>
                    <span className="text-white/50">Requested: </span>
                    {formatDate(row.createdAt)}
                  </div>
                  {row.issuedDate && (
                    <div>
                      <span className="text-white/50">Issued: </span>
                      {formatDate(row.issuedDate)}
                    </div>
                  )}
                  {row.issuedDate && (
                    <div>
                      <span className="text-white/50">Days Elapsed: </span>
                      {Math.floor((Date.now() - new Date(row.issuedDate).getTime()) / (1000 * 60 * 60 * 24))} days
                    </div>
                  )}
                  {!row.issuedDate && row.status === "PENDING" && (
                    <div>
                      <span className="text-white/50">Days Since Request: </span>
                      {Math.floor((Date.now() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days
                    </div>
                  )}
                  {row.student?.user?.email && (
                    <div>
                      <span className="text-white/50">Email: </span>
                      {row.student.user.email}
                    </div>
                  )}
                </div>
                {STATUS_MAP[row.status] === "pending" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={!!actingId}
                      onClick={() => openApproveModal(row.id)}
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-lime-400 text-black text-xs font-semibold disabled:opacity-50"
                    >
                      {actingId === row.id && approvingId === row.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle size={14} />
                      )}
                      Approve
                    </button>
                    <button
                      disabled={!!actingId}
                      onClick={() => handleReject(row.id)}
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                )}
                {STATUS_MAP[row.status] === "approved" && (
                  row.tcDocumentUrl ? (
                    <a
                      href={row.tcDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs"
                    >
                      <Download size={14} />
                      Download
                    </a>
                  ) : (
                    <span className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-full bg-white/5 text-white/50 text-xs cursor-default">
                      <Download size={14} />
                      N/A
                    </span>
                  )
                )}
                {STATUS_MAP[row.status] === "rejected" && (
                  <span className="text-red-400 font-medium text-xs">
                    Rejected
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Table md–lg */}
        <div className="hidden md:block lg:hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Class
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Certificate Type
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Request Details
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/60 text-sm">
                    No {activeTab} requests
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-white/5 transition-all">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium">
                        {row.student?.user?.name ?? "—"}
                      </div>
                      <div className="text-xs text-white/60">
                        {row.student?.user?.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-3 py-1 rounded-full bg-white/10 text-xs">
                        {classNameDisplay(row)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {getCertificateTypeLabel(row.certificateType)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-white/60 space-y-1">
                        <div>
                          <span className="text-white/50">ID: </span>
                          {`CR${row.id.slice(-6).toUpperCase()}`}
                        </div>
                        <div>
                          <span className="text-white/50">Purpose: </span>
                          {row.reason || "—"}
                        </div>
                        <div>
                          <span className="text-white/50">Requested: </span>
                          {formatDate(row.createdAt)}
                        </div>
                        {row.issuedDate && (
                          <div>
                            <span className="text-white/50">Issued: </span>
                            {formatDate(row.issuedDate)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {STATUS_MAP[row.status] === "pending" && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            disabled={!!actingId}
                            onClick={() => openApproveModal(row.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-lime-400 text-black text-xs font-semibold disabled:opacity-50"
                          >
                            {actingId === row.id && approvingId === row.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <CheckCircle size={14} />
                            )}
                            <span className="hidden md:inline">Approve</span>
                          </button>
                          <button
                            disabled={!!actingId}
                            onClick={() => handleReject(row.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            <span className="hidden md:inline">Reject</span>
                          </button>
                        </div>
                      )}
                      {STATUS_MAP[row.status] === "approved" && (
                        row.tcDocumentUrl ? (
                          <a
                            href={row.tcDocumentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs"
                          >
                            <Download size={14} />
                            <span className="hidden md:inline">Download</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 text-white/50 text-xs cursor-default">
                            <Download size={14} />
                            <span className="hidden md:inline">N/A</span>
                          </span>
                        )
                      )}
                      {STATUS_MAP[row.status] === "rejected" && (
                        <span className="text-red-400 font-medium text-xs">
                          Rejected
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table lg+ */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  REQUEST ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  STUDENT NAME
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  CLASS
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  CERTIFICATE TYPE
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  PURPOSE
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  REQUEST DATE
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  ISSUED DATE
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-white/60 text-sm"
                  >
                    No {activeTab} requests
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-white/5 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap text-white/70 text-xs">
                      {`CR${row.id.slice(-6).toUpperCase()}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium">
                        {row.student?.user?.name ?? "—"}
                      </div>
                      {row.student?.user?.email && (
                        <div className="text-xs text-white/60">
                          {row.student.user.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 rounded-full bg-white/10 text-xs">
                        {classNameDisplay(row)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-white">
                        {getCertificateTypeLabel(row.certificateType)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white/70 max-w-xs">
                      <div className="truncate" title={row.reason || "—"}>
                        {row.reason || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white/70">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-white/70">
                      {row.issuedDate ? formatDate(row.issuedDate) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {STATUS_MAP[row.status] === "pending" && (
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={!!actingId}
                            onClick={() => openApproveModal(row.id)}
                            className="flex items-center gap-1 px-3 py-2 rounded-full bg-lime-400 text-black text-xs font-semibold disabled:opacity-50"
                          >
                            {actingId === row.id && approvingId === row.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <CheckCircle size={14} />
                            )}
                            <span className="hidden sm:inline">Approve</span>
                          </button>
                          <button
                            disabled={!!actingId}
                            onClick={() => handleReject(row.id)}
                            className="flex items-center gap-1 px-3 py-2 rounded-full bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                        </div>
                      )}
                      {STATUS_MAP[row.status] === "approved" && (
                        row.tcDocumentUrl ? (
                          <a
                            href={row.tcDocumentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs"
                          >
                            <Download size={14} />
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white/5 text-white/50 text-xs cursor-default">
                            <Download size={14} />
                            <span className="hidden sm:inline">N/A</span>
                          </span>
                        )
                      )}
                      {STATUS_MAP[row.status] === "rejected" && (
                        <span className="text-red-400 font-medium">
                          Rejected
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve Modal with File Upload */}
      {showApproveModal && approvingId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Approve Certificate Request</h3>
              <button
                onClick={closeApproveModal}
                className="text-gray-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Attach Certificate Document (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg transition"
                  >
                    <Upload size={16} />
                    {selectedFile ? "Change File" : "Choose File"}
                  </button>
                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <File size={16} />
                      <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  PDF, DOC, DOCX, or image files (max 10MB)
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleApprove(approvingId)}
                  disabled={actingId === approvingId || uploadingFile}
                  className="flex-1 px-4 py-3 bg-lime-400 text-black font-semibold rounded-lg hover:bg-lime-400/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actingId === approvingId || uploadingFile ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {uploadingFile ? "Uploading..." : "Approving..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      Approve
                    </>
                  )}
                </button>
                <button
                  onClick={closeApproveModal}
                  disabled={actingId === approvingId || uploadingFile}
                  className="px-4 py-3 bg-[#2d2d2d] text-white font-semibold rounded-lg hover:bg-[#404040] transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
