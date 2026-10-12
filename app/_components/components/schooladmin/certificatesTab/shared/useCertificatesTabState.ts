import { useRef, useState } from "react";
import type { CertificateRequestListItem } from "../../Certificates";
import { uploadImage } from "@/app/_components/utils/upload";
import { STATUS_MAP, type TabStatus } from "./certificatesTabHelpers";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export function useCertificatesTabState({
  certificateRequests,
  onRefresh,
  onRequestPatch,
}: {
  certificateRequests: CertificateRequestListItem[];
  onRefresh: () => void;
  onRequestPatch?: (id: string, patch: Partial<CertificateRequestListItem>) => void;
}) {
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
    } catch (e: unknown) {
      alert(getErrorMessage(e) || "Failed to approve");
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
    } catch (e: unknown) {
      alert(getErrorMessage(e) || "Failed to reject");
    } finally {
      setActingId(null);
    }
  };

  return {
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
  };
}
