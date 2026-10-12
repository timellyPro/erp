import { CheckCircle, AlertTriangle, XCircleIcon } from "lucide-react";
import type { LeaveStatus as Status, SchoolAdminLeave as Leave } from "@/lib/school/loadSchoolAdminFastTabs";
import { ActionButton } from "./ActionButton";

export function LeaveCardList({
  leaves,
  status,
  actionId,
  onApprove,
  onReject,
  onConditional,
}: {
  leaves: Leave[];
  status: Status;
  actionId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onConditional: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {leaves.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          No {status.toLowerCase()} requests
        </div>
      ) : (
        leaves.map((l: Leave) => {
          const days =
            (new Date(l.toDate).getTime() -
              new Date(l.fromDate).getTime()) /
            (1000 * 60 * 60 * 24) +
            1;

          const fromDate = new Date(l.fromDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          });

          const toDate = new Date(l.toDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          });

          return (
            <div
              key={l.id}
              className="w-full box-border bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-3 sm:p-4 space-y-2"
            >
              {/* Teacher Name */}
              <p className="text-white font-semibold text-sm">{l.teacher.name}</p>

              {/* Leave Details */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Leave Type</span>
                  <span className="text-white font-medium">{l.leaveType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Duration</span>
                  <span className="text-white font-medium">
                    {fromDate} - {toDate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Days</span>
                  <span className="text-white font-medium">{days}</span>
                </div>
              </div>

              {/* Reason */}
              <div className="pt-1">
                <p className="text-xs text-gray-400">Reason</p>
                <p className="text-xs text-white">{l.reason ?? "—"}</p>
              </div>

              {/* Pending Leaves Warning */}
              {status === "PENDING" && (
                <div className="flex items-center gap-1 text-yellow-400 text-xs pt-1">
                  <AlertTriangle size={14} />
                  <span>pending leaves</span>
                </div>
              )}

              {/* Conditional Remarks */}
              {l.status === "CONDITIONALLY_APPROVED" && l.remarks && (
                <div className="bg-yellow-500/30 border border-yellow-400 rounded-lg p-2 text-xs mt-1">
                  <p className="text-yellow-300 font-semibold">
                    Condition: {l.remarks}
                  </p>
                </div>
              )}

              {/* Actions or Status */}
              {status === "PENDING" && (
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <ActionButton
                    full
                    label="Approve"
                    icon={CheckCircle}
                    color="green"
                    onClick={() => onApprove(l.id)}
                    disabled={actionId === l.id}
                  />
                  <ActionButton full label="Conditional" icon={AlertTriangle} color="yellow" onClick={() => onConditional(l.id)} disabled={actionId === l.id} />
                  <ActionButton full label="Reject" icon={XCircleIcon} color="red" onClick={() => onReject(l.id)} disabled={actionId === l.id} />
                </div>


              )}

              {status === "APPROVED" && (
                <div className="flex justify-end pt-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${l.status === "CONDITIONALLY_APPROVED"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-lime-500/20 text-lime-400"
                      }`}
                  >
                    {l.status === "CONDITIONALLY_APPROVED"
                      ? "Conditional"
                      : "Approved"}
                  </span>
                </div>
              )}

              {status === "REJECTED" && (
                <div className="flex justify-end pt-2">

                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
