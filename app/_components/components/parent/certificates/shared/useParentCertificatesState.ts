import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Certificate, CertificateRequest } from "./parentCertificatesHelpers";

export function useParentCertificatesState() {
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
    } catch {
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

  return {
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
  };
}
