"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "../common/PageHeader";
import { CircleAlert, Clock, FileText, SquareCheck } from "lucide-react";
import StatCard from "../common/statCard";
import CertificatesTab from "./certificatesTab/CertificatesTab";

export type CertificateRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CertificateRequestListItem {
  id: string;
  certificateType: string | null;
  reason: string | null;
  status: string;
  issuedDate: string | null;
  tcDocumentUrl: string | null;
  createdAt: string;
  student: {
    id: string;
    user: { id: string; name: string | null; email: string | null };
    class: { id: string; name: string; section: string | null } | null;
  };
  requestedBy: { id: string; name: string | null; email: string | null } | null;
  approvedBy: { id: string; name: string | null; email: string | null } | null;
}

export default function SchoolAdminCertificatesTab() {
  const [certificateRequests, setCertificateRequests] = useState<CertificateRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCertificateRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary source is /api/tc/list which is stable across environments.
      let res = await fetch("/api/tc/list", { credentials: "include" });
      // Fallback for environments still serving certificate request route directly.
      if (res.status === 404) {
        res = await fetch("/api/certificates/requests/list", { credentials: "include" });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to load certificate requests");
      }
      const data = await res.json();
      setCertificateRequests(data.certificateRequests ?? data.tcs ?? []);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setCertificateRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificateRequests();
  }, [fetchCertificateRequests]);

  const total = certificateRequests.length;
  const pending = certificateRequests.filter((t) => t.status === "PENDING").length;
  const approved = certificateRequests.filter((t) => t.status === "APPROVED").length;
  const rejected = certificateRequests.filter((t) => t.status === "REJECTED").length;

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6 text-gray-200">
      <PageHeader
        title="Certificate Requests"
        subtitle="Manage and process student certificate applications."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Total Requests"
          value={<span className="text-xl sm:text-2xl font-semibold">{total}</span>}
          icon={
            <FileText className="text-blue-400/20 w-12 h-12 sm:w-14 sm:h-14 lg:w-[70px] lg:h-[70px]" />
          }
          iconVariant="plain"
        />
        <StatCard
          title="Pending"
          value={<span className="text-xl sm:text-2xl font-semibold">{pending}</span>}
          icon={
            <Clock className="text-orange-400/20 w-12 h-12 sm:w-14 sm:h-14 lg:w-[70px] lg:h-[70px]" />
          }
          iconVariant="plain"
        />
        <StatCard
          title="Approved"
          value={<span className="text-xl sm:text-2xl font-semibold">{approved}</span>}
          icon={
            <SquareCheck className="text-lime-400/20 w-12 h-12 sm:w-14 sm:h-14 lg:w-[70px] lg:h-[70px]" />
          }
          iconVariant="plain"
        />
        <StatCard
          title="Rejected"
          value={<span className="text-xl sm:text-2xl font-semibold">{rejected}</span>}
          icon={
            <CircleAlert className="text-red-400/20 w-12 h-12 sm:w-14 sm:h-14 lg:w-[70px] lg:h-[70px]" />
          }
          iconVariant="plain"
        />
      </div>

      <div className="mt-6 w-full overflow-x-auto">
        <CertificatesTab
          certificateRequests={certificateRequests}
          loading={loading}
          error={error}
          onRefresh={fetchCertificateRequests}
        />
      </div>
    </div>
  );
}
