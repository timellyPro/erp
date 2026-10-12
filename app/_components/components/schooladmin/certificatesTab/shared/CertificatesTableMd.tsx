import { CheckCircle, Download, Loader2, XCircle } from "lucide-react";
import type { CertificateRequestListItem } from "../../Certificates";
import { STATUS_MAP, classNameDisplay, formatDate, getCertificateTypeLabel, type TabStatus } from "./certificatesTabHelpers";

export function CertificatesTableMd({
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
  return (
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
                        onClick={() => onOpenApproveModal(row.id)}
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
                        onClick={() => onReject(row.id)}
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
  );
}
