import { CheckCircle, Download, Loader2, XCircle } from "lucide-react";
import type { CertificateRequestListItem } from "../../Certificates";
import { STATUS_MAP, classNameDisplay, formatDate, getCertificateTypeLabel, type TabStatus } from "./certificatesTabHelpers";

export function CertificatesTableLg({
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
                        onClick={() => onOpenApproveModal(row.id)}
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
                        onClick={() => onReject(row.id)}
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
  );
}
