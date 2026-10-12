import { useState } from "react";
import { CheckCircle, Download, Loader2, XCircle } from "lucide-react";
import type { CertificateRequestListItem } from "../../Certificates";
import { STATUS_MAP, classNameDisplay, formatDate, getCertificateTypeLabel, type TabStatus } from "./certificatesTabHelpers";

function daysSince(isoDate: string, now: number): number {
  return Math.floor((now - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

export function CertificatesMobileCards({
  filtered,
  activeTab,
  actingId,
  approvingId,
  onOpenApproveModal,
  onReject,
}: {
  filtered: CertificateRequestListItem[];
  activeTab: TabStatus;
  actingId: string | null;
  approvingId: string | null;
  onOpenApproveModal: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [now] = useState(() => Date.now());
  return (
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
                  {daysSince(row.issuedDate, now)} days
                </div>
              )}
              {!row.issuedDate && row.status === "PENDING" && (
                <div>
                  <span className="text-white/50">Days Since Request: </span>
                  {daysSince(row.createdAt, now)} days
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
                  onClick={() => onOpenApproveModal(row.id)}
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
                  onClick={() => onReject(row.id)}
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
  );
}
