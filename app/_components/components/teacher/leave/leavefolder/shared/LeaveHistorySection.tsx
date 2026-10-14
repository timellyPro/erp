import { Calendar, Edit3, X, XCircle } from "lucide-react";
import { formatDate, leaveTypeLabel, statusStyle } from "./teacherLeaveHelpers";
import type { LeaveRecord } from "./useTeacherLeaveState";

export function LeaveHistorySection({
  myLeaves,
  onEdit,
  onCancel,
}: {
  myLeaves: LeaveRecord[];
  onEdit: (leave: LeaveRecord) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="max-w-6xl mx-auto">
      <h3 className="text-xl font-bold text-white px-4 md:px-0 mb-6">My Leave History</h3>

      {/* MOBILE VIEW: Vertical Cards */}
      <div className="md:hidden max-w-6xl mx-auto space-y-4 ">
        {myLeaves.map((leave) => {
          const start = new Date(leave.fromDate);
          const end = new Date(leave.toDate);
          const days =
            Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          return (
            <div
              key={leave.id}
              className="border border-white/10 rounded-[1.2rem] p-4 backdrop-blur-lg bg-white/[0.02] shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                    Leave Type
                  </p>
                  <p className="text-[#b4f03d] font-bold text-sm">
                    {leaveTypeLabel(leave.leaveType)}
                  </p>
                </div>

                <span
                  className={`inline-flex flex-col items-center justify-center px-3 py-1 rounded-lg text-[10px] font-bold border leading-tight ${statusStyle(
                    leave.status
                  )}`}
                >
                  {leave.status === "CONDITIONALLY_APPROVED" ? (
                    <>
                      <span>CONDITIONALLY</span>
                      <span>APPROVED</span>
                    </>
                  ) : (
                    leave.status.replace(/_/g, " ")
                  )}
                </span>
              </div>

              {/* Date Info */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                  <Calendar size={14} className="text-[#b4f03d]" />
                  <span className="text-xs text-white/80">
                    {formatDate(leave.fromDate)} – {formatDate(leave.toDate)}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                  <span className="text-xs font-bold text-white">
                    {days} {days > 1 ? "Days" : "Day"}
                  </span>
                </div>
              </div>

              {/* Reason */}
              <div className="bg-black/20 rounded-xl px-4 py-3 border border-white/[0.05]">
                <p className="text-[11px] uppercase tracking-widest text-white/30 font-bold mb-1">
                  Reason
                </p>
                <p className="text-sm text-white/70 leading-relaxed">
                  {leave.reason || "—"}
                </p>
              </div>

              {/* Actions */}
              {leave.status === "PENDING" && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => onEdit(leave)}
                    className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>

                  <button
                    onClick={() => onCancel(leave.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 py-2.5 rounded-xl text-xs font-bold text-red-400 transition-all"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP VIEW: Table */}
      <div className="hidden md:block border border-white/10 rounded-[1.5rem] overflow-hidden bg-white/[0.02]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-white/30 text-[11px] uppercase tracking-[0.2em] bg-white/5">
              <th className="px-4 py-4 font-bold">Type</th>
              <th className="px-4 py-4 font-bold">Dates</th>
              <th className="px-4 py-4 font-bold text-center">Days</th>
              <th className="px-4 py-4 font-bold text-center">Status</th>
              <th className="px-6 py-4 font-bold">Reason/Remarks</th>
              <th className="px-4 py-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {myLeaves.map((leave) => {
              const days = Math.ceil((new Date(leave.toDate).getTime() - new Date(leave.fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
              return (
                <tr key={leave.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-5 font-bold text-sm">{leaveTypeLabel(leave.leaveType)}</td>
                  <td className="px-4 py-5 text-white/60 text-sm">{leave.fromDate.split("T")[0]} - {leave.toDate.split("T")[0]}</td>
                  <td className="px-4 py-5 text-center font-bold text-sm">{days}</td>
                  <td className="px-6 py-5 text-center">
                    <span
                      className={`inline-flex flex-col items-center justify-center px-4 py-1.5 rounded-lg text-[11px] font-bold border leading-tight ${statusStyle(
                        leave.status
                      )}`}
                    >
                      {leave.status === "CONDITIONALLY_APPROVED" ? (
                        <>
                          <span>CONDITIONALLY</span>
                          <span>APPROVED</span>
                        </>
                      ) : (
                        leave.status.replace(/_/g, " ")
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-5 max-w-[200px]">
                    <div className=" text-sm text-white/80">{leave.reason}</div>
                    <div className="text-[12px] text-white/30 mt-1">{leave.remarks || ""}</div>
                  </td>
                  <td className="px-4 py-5">
                    <div className="flex justify-end gap-3">
                      {leave.status === "PENDING" && (
                        <>
                          <button onClick={() => onEdit(leave)} className="p-2 text-white/40 hover:text-[#b4f03d] transition-all"><Edit3 size={18} /></button>
                          <button onClick={() => onCancel(leave.id)} className="p-2 text-white/40 hover:text-red-400 transition-all"><XCircle size={18} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
