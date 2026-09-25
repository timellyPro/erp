"use client";
import { useCallback } from "react";
import TimellyLoader from "../common/TimellyLoader";
import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  CheckCircle,
  UserCheck,
  FileText,
  AlertTriangle,
  XCircleIcon
} from "lucide-react";
import PageHeader from "../common/PageHeader";
import {
  loadTeacherLeavesPage,
  peekTeacherLeavesPage,
  setTeacherLeavesPageCache,
  type LeaveStatus,
  type SchoolAdminLeave,
} from "@/lib/loadSchoolAdminFastTabs";

/* ---------------- TYPES ---------------- */

type Status = LeaveStatus;
type Leave = SchoolAdminLeave;

/* ---------------- MAIN ---------------- */

export default function SchoolTeacherLeavesTab() {
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [allLeaves, setAllLeaves] = useState<Leave[]>([]);
  const [activeTab, setActiveTab] = useState<Status>("PENDING");
  const [loading, setLoading] = useState(true);

  const [showConditionalModal, setShowConditionalModal] = useState(false);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const [conditionalMessage, setConditionalMessage] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  /* ---------------- DATE HELPERS ---------------- */

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const isToday = (date?: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const isTodayBetween = (from: string, to: string) => {
    const f = new Date(from);
    const t = new Date(to);
    f.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return today >= f && today <= t;
  };

  const currentMonthLabel = new Date().toLocaleString("en-US", {
    month: "short",
  });

  const isCurrentMonth = (date: string) => {
    const d = new Date(date);
    const now = new Date();

    return (
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  };


  const iconStyles = {
    yellow: "border-yellow-400 text-yellow-400 bg-yellow-400/10",
    lime: "border-lime-400 text-lime-400 bg-lime-400/10",
    blue: "border-blue-400 text-blue-400 bg-blue-400/10",
    purple: "border-purple-400 text-purple-400 bg-purple-400/10",
  };
  const textColor = {
    yellow: "text-yellow-400",
    lime: "text-lime-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
  }

  /* ---------------- LOAD DATA ---------------- */



  const applyLeavesPayload = useCallback((payload: { pendingLeaves: Leave[]; allLeaves: Leave[] }) => {
    setPendingLeaves(payload.pendingLeaves);
    setAllLeaves(payload.allLeaves);
  }, []);

  const loadLeaves = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekTeacherLeavesPage();
      if (cached) {
        applyLeavesPayload(cached);
        setLoading(false);
        void loadLeaves(true);
        return;
      }
    }

    setLoading(pendingLeaves.length === 0 && allLeaves.length === 0);
    try {
      const payload = await loadTeacherLeavesPage({ revalidate });
      applyLeavesPayload(payload);
    } catch {
      if (pendingLeaves.length === 0 && allLeaves.length === 0) {
        setPendingLeaves([]);
        setAllLeaves([]);
      }
    } finally {
      setLoading(false);
    }
  }, [allLeaves.length, applyLeavesPayload, pendingLeaves.length]);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  const applyLeaveStatus = useCallback(
    (id: string, status: Status, remarks?: string) => {
      const source =
        pendingLeaves.find((leave) => leave.id === id) ||
        allLeaves.find((leave) => leave.id === id);
      if (!source) return;

      const stamp = new Date().toISOString();
      const patched: Leave = {
        ...source,
        status,
        remarks: remarks ?? source.remarks,
        approvedAt: status === "REJECTED" ? source.approvedAt : stamp,
        updatedAt: stamp,
      };
      const nextPending = pendingLeaves.filter((leave) => leave.id !== id);
      const nextAll = allLeaves.some((leave) => leave.id === id)
        ? allLeaves.map((leave) => (leave.id === id ? patched : leave))
        : [patched, ...allLeaves];

      setPendingLeaves(nextPending);
      setAllLeaves(nextAll);
      setTeacherLeavesPageCache({ pendingLeaves: nextPending, allLeaves: nextAll });
    },
    [allLeaves, pendingLeaves]
  );

  /* ---------------- ACTIONS ---------------- */

  async function approveLeave(id: string) {
    setActionId(id);

    try {
      const res = await fetch(`/api/leaves/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "FULL" }),
      });

      if (res.ok) {
        applyLeaveStatus(id, "APPROVED");
        void loadLeaves(true);
      } else {
        void loadLeaves(true);
      }
    } finally {
      setActionId(null);
    }
  }

  async function conditionalApproveLeave() {
    if (!selectedLeaveId || !conditionalMessage.trim()) return;

    setActionId(selectedLeaveId);

    try {
      const res = await fetch(`/api/leaves/${selectedLeaveId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CONDITIONAL",
          remarks: conditionalMessage,
        }),
      });

      if (res.ok) {
        applyLeaveStatus(selectedLeaveId, "CONDITIONALLY_APPROVED", conditionalMessage);
        void loadLeaves(true);
      } else {
        void loadLeaves(true);
      }

      setShowConditionalModal(false);
      setConditionalMessage("");
      setSelectedLeaveId(null);
    } finally {
      setActionId(null);
    }
  }

  async function rejectLeave(id: string) {
    setActionId(id);

    try {
      const res = await fetch(`/api/leaves/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: "Rejected by admin" }),
      });

      if (res.ok) {
        applyLeaveStatus(id, "REJECTED", "Rejected by admin");
        void loadLeaves(true);
      } else {
        void loadLeaves(true);
      }
    } finally {
      setActionId(null);
    }
  }

  /* ---------------- FILTERS ---------------- */

  const approvedToday = useMemo(
    () =>
      allLeaves.filter(
        (l) =>
          (l.status === "APPROVED" ||
            l.status === "CONDITIONALLY_APPROVED") &&
          isToday(l.approvedAt || l.updatedAt)
      ),
    [allLeaves]
  );

  const currentMonthLeaves = useMemo(
    () =>
      allLeaves.filter((l) =>
        isCurrentMonth(l.fromDate)
      ),
    [allLeaves]
  );


  const teachersOnLeaveToday = useMemo(
    () => allLeaves.filter((l) => isTodayBetween(l.fromDate, l.toDate)),
    [allLeaves]
  );

  const approvedLeaves = useMemo(
    () =>
      allLeaves.filter(
        (l) =>
          l.status === "APPROVED" ||
          l.status === "CONDITIONALLY_APPROVED"
      ),
    [allLeaves]
  );

  const rejectedLeaves = useMemo(
    () => allLeaves.filter((l) => l.status === "REJECTED"),
    [allLeaves]
  );

  if (loading && pendingLeaves.length === 0 && allLeaves.length === 0) {
    return (
      <TimellyLoader
        title="Loading teacher leaves"
        steps={["Pending requests", "Leave history", "Approvals"]}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-3 md:px-0 overflow-x-hidden">
      <PageHeader
        title="Teacher Leave Management"
        subtitle={loading ? "Refreshing leave requests..." : "Review and manage teacher leave requests"}
      />

      {/* ---------------- STATS ---------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">

        {/* Pending Requests */}
        <div className="p-3 sm:p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl flex items-center gap-2 sm:gap-4">
          <div className={`p-2 rounded-lg border ${iconStyles.yellow}`}>
            <Clock size={16} />
          </div>
          <div>
            <p className="text-xs text-white/60">Pending Requests</p>
            <p className={`text-lg sm:text-2xl font-bold ${textColor.yellow}`}>{pendingLeaves.length}</p>
          </div>
        </div>

        {/* Approved Today */}
        <div className="p-3 sm:p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl flex items-center gap-2 sm:gap-4">
          <div className={`p-2 rounded-lg border ${iconStyles.lime}`}>
            <CheckCircle size={16} />
          </div>
          <div>
            <p className="text-xs text-white/60">Approved Today</p>
            <p className={`text-lg sm:text-2xl font-bold ${textColor.lime}`}>{approvedToday.length}</p>
          </div>
        </div>

        {/* Teachers on Leave */}
        <div className="p-3 sm:p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl flex items-center gap-2 sm:gap-4">
          <div className={`p-2 rounded-lg border ${iconStyles.blue}`}>
            <UserCheck size={16} />
          </div>
          <div>
            <p className="text-xs text-white/60">Teachers on Leave</p>
            <p className={`text-lg sm:text-2xl font-bold ${textColor.blue}`}>{teachersOnLeaveToday.length}</p>
          </div>
        </div>

        {/* Total Requests */}
        <div className="p-3 sm:p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl flex items-center gap-2 sm:gap-4">
          <div className={`p-2 rounded-lg border ${iconStyles.purple}`}>
            <FileText size={16} />
          </div>
          <div>
            <p className="text-xs text-white/60">
              Total Requests ({currentMonthLabel})
            </p>
            <p className={`text-lg sm:text-2xl font-bold ${textColor.purple}`}>
              {currentMonthLeaves.length}
            </p>
          </div>
        </div>

      </div>


      {/* ---------------- TABS ---------------- */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-2">
        <div className="grid grid-cols-3 rounded-lg overflow-hidden">
          <IconTab label="Pending" count={pendingLeaves.length} icon={Clock} active={activeTab === "PENDING"} onClick={() => setActiveTab("PENDING")} />
          <IconTab label="Approved" count={approvedLeaves.length} icon={CheckCircle} active={activeTab === "APPROVED"} onClick={() => setActiveTab("APPROVED")} />
          <IconTab label="Rejected" count={rejectedLeaves.length} icon={UserCheck} active={activeTab === "REJECTED"} onClick={() => setActiveTab("REJECTED")} />
        </div>

        <div className="mt-4">
          {/* Mobile View - Card Layout */}
          <div className="md:hidden">
            <LeaveCardList
              leaves={
                activeTab === "PENDING"
                  ? pendingLeaves
                  : activeTab === "APPROVED"
                    ? approvedLeaves
                    : rejectedLeaves
              }
              status={activeTab}
              actionId={actionId}
              onApprove={approveLeave}
              onReject={rejectLeave}
              onConditional={(id: string) => {
                setSelectedLeaveId(id);
                setShowConditionalModal(true);
              }}
            />
          </div>

          {/* Desktop View - Table Layout */}
          <div className="hidden md:block">
            <LeaveTable
              leaves={
                activeTab === "PENDING"
                  ? pendingLeaves
                  : activeTab === "APPROVED"
                    ? approvedLeaves
                    : rejectedLeaves
              }
              status={activeTab}
              actionId={actionId}
              onApprove={approveLeave}
              onReject={rejectLeave}
              onConditional={(id: string) => {
                setSelectedLeaveId(id);
                setShowConditionalModal(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* ---------------- CONDITIONAL MODAL ---------------- */}
      {showConditionalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">

          <div className="bg-linear-to-br from-[#0b1222] to-[#101b35] rounded-2xl p-6 w-full sm:w-[420px] space-y-4">
            <h3 className="text-white text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="text-yellow-400" /> Conditional Approval
            </h3>
            <p className="text-xs text-white/50">Please specify the condition for approving this leave request. The teacher will be notified of this condition.
            </p>
            <textarea
              className="w-full h-28 rounded-xl bg-black/30 border border-yellow-500/40 p-3 text-sm text-white outline-none"
              placeholder="e.g. Must complete pending grading before leaving..."
              value={conditionalMessage}
              onChange={(e) => setConditionalMessage(e.target.value)}
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConditionalModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-white"
              >
                Cancel
              </button>
              <button
                onClick={conditionalApproveLeave}
                disabled={actionId === selectedLeaveId}
                className="px-5 py-2 rounded-xl bg-yellow-500 text-black font-semibold disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- CARD LIST (MOBILE) ---------------- */

function LeaveCardList({ leaves, status, actionId, onApprove, onReject, onConditional }: any) {
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

/* ---------------- TABLE (DESKTOP) ---------------- */

function LeaveTable({ leaves, status, actionId, onApprove, onReject, onConditional }: any) {
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

/* ---------------- UI HELPERS ---------------- */

function Stat({ title, value, icon: Icon, color }: any) {
  const colors: any = {
    yellow: "text-yellow-400",
    lime: "text-lime-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center gap-4">
      <Icon className={colors[color]} size={20} />
      <div>
        <p className="text-xs text-gray-400">{title}</p>
        <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      </div>
    </div>
  );
}

function IconTab({ label, count, icon: Icon, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 text-xs sm:text-sm ${active
        ? "bg-white/5 text-lime-400 border-b-2 border-lime-400"
        : "text-gray-400 hover:text-white"
        }`}
    >
      <Icon size={16} />
      <span>
        {label} <span className="hidden sm:inline">({count})</span>
        <span className="sm:hidden">({count})</span>
      </span>
    </button>
  );
}

function ActionButton({ label, icon: Icon, color, onClick, full, disabled }: any) {
  const colorMap: any = {
    green:
      "border-lime-400 text-black bg-lime-400",
    yellow:
      "border-yellow-400 text-black bg-yellow-400",
    red:
      "border-red-500 text-white bg-red-500",
  };
  const mobileColorMap: any = {
    green:
      "border-lime-400  text-lime-400 bg-lime-400/10",
    yellow:
      "border-yellow-400 text-yellow-400 bg-yellow-400/10",
    red:
      "border-red-500 text-red-500 bg-red-500/10",
  };

  // ICON-ONLY (desktop table)
  if (!label) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`p-2 rounded-xl border ${colorMap[color]} transition disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Icon size={16} />
      </button>
    );
  }

  // FULL BUTTON (mobile cards)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
    inline-flex items-center gap-2 flex-col
    px-1 py-2 text-xs font-semibold
    border ${mobileColorMap[color]}
    ${full ? "w-full justify-center rounded-xl" : "rounded-full"}
    transition
    disabled:opacity-50 disabled:cursor-not-allowed
  `}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
