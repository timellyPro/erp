import { CheckCircle, AlertTriangle, XCircleIcon } from "lucide-react";
import type { LeaveStatus as Status, SchoolAdminLeave as Leave } from "@/lib/school/loadSchoolAdminFastTabs";
import { ActionButton } from "./ActionButton";

export function LeaveTable({
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
    <table className="w-full text-sm border-collapse">
      <thead className="text-gray-400 border-b border-gray-600">
        <tr>
          <th className="text-left py-3 px-3">Teacher Name</th>
          <th className="py-3 px-3">Leave Type</th>
          <th className="py-3 px-3">Dates</th>
          <th className="py-3 px-3">Days</th>
          <th className="py-3 px-3 md:w-[20%] lg:w-[30%] text-left">Reason</th>
          {status === "PENDING" && <th className="py-3 px-3">Actions</th>}
          {status === "APPROVED" && <th className="py-3 px-3">Status</th>}
        </tr>
      </thead>

      <tbody>
        {leaves.map((l: Leave) => {
          const days =
            (new Date(l.toDate).getTime() -
              new Date(l.fromDate).getTime()) /
            (1000 * 60 * 60 * 24) +
            1;

          return (
            <tr key={l.id} className="border-b border-gray-700 text-white">
              <td className="py-4 font-medium">{l.teacher.name}</td>
              <td className="text-center">{l.leaveType}</td>
              <td className="text-center">
                {new Date(l.fromDate).toLocaleDateString()} –{" "}
                {new Date(l.toDate).toLocaleDateString()}
              </td>
              <td className="text-center">{days}</td>

              <td className="px-3 py-4 text-gray-300 whitespace-normal wrap-break-word text-left">
                {l.reason ?? "—"}

                {l.status === "CONDITIONALLY_APPROVED" && l.remarks && (
                  <div className="mt-2 flex items-start gap-2 text-yellow-400 text-xs">
                    <AlertTriangle size={14} className="mt-[2px]" />
                    <span>Condition: {l.remarks}</span>
                  </div>
                )}
              </td>

              {status === "APPROVED" && (
                <td className="text-center">
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
                </td>
              )}

              {status === "PENDING" && (
                <td className="text-center space-x-2">
                  <ActionButton
                    icon={CheckCircle}
                    color="green"
                    onClick={() => onApprove(l.id)}
                    disabled={actionId === l.id}
                  />
                  <ActionButton icon={AlertTriangle} color="yellow" onClick={() => onConditional(l.id)} disabled={actionId === l.id} />
                  <ActionButton icon={XCircleIcon} color="red" onClick={() => onReject(l.id)} disabled={actionId === l.id} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
