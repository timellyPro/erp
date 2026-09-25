import React, { useState, useEffect, useCallback } from "react";
import { Calendar, ChevronDown, Plus, X, CheckCircle, Edit3, XCircle, Clock } from "lucide-react";
import PageHeader from "../../../common/PageHeader";
import TimellyLoader from "../../../common/TimellyLoader";
import {
  loadTeacherMyLeaves,
  peekTeacherMyLeaves,
  setTeacherMyLeavesCache,
  type TeacherMyLeave,
} from "@/lib/loadTeacherFastTabs";

const LEAVE_TYPE_OPTIONS = [
  { label: "Sick Leave", value: "SICK" },
  { label: "Casual Leave", value: "CASUAL" },
  { label: "Emergency Leave", value: "UNPAID" },
  { label: "Duty Leave", value: "PAID" },
];

type LeaveRecord = TeacherMyLeave;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function leaveTypeLabel(t: string) {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function statusStyle(s: string) {
  if (s === "APPROVED") return "bg-[#b4f03d]/10 text-[#b4f03d] border-[#b4f03d]/30";
  if (s === "CONDITIONALLY_APPROVED") return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  if (s === "REJECTED") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";

}



export default function TeacherLeave() {
  const initial = peekTeacherMyLeaves();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    leaveType: "SICK",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>(() => initial ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);

  const applyLeaves = useCallback((leaves: LeaveRecord[]) => {
    setMyLeaves(leaves);
    setTeacherMyLeavesCache(leaves);
  }, []);

  const fetchMyLeaves = useCallback(
    async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekTeacherMyLeaves();
        if (cached) {
          setMyLeaves(cached);
          setLoading(false);
          void fetchMyLeaves(true);
          return;
        }
      }

      try {
        setLoading((prev) => (myLeaves.length === 0 ? true : prev));
        const leaves = await loadTeacherMyLeaves({ revalidate: true });
        applyLeaves(leaves);
      } catch {
        if (myLeaves.length === 0) setMyLeaves([]);
      } finally {
        setLoading(false);
      }
    },
    [applyLeaves, myLeaves.length]
  );

  useEffect(() => {
    void fetchMyLeaves(false);
  }, [fetchMyLeaves]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate || !formData.reason?.trim()) {
      setError("Please fill From Date, To Date and Reason.");
      return;
    }
    setError(null);
    setSubmitLoading(true);
    try {
      if (editingLeave) {
        const res = await fetch(`/api/leaves/${editingLeave.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            leaveType: formData.leaveType,
            fromDate: formData.startDate,
            toDate: formData.endDate,
            reason: formData.reason.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || data?.message || "Failed to update leave");
          return;
        }
        const updated = (data?.id ? data : data?.leave) as LeaveRecord | undefined;
        if (updated?.id) {
          const next = myLeaves.map((l) => (l.id === updated.id ? { ...l, ...updated } : l));
          applyLeaves(next);
        }
        setEditingLeave(null);
        setFormData({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });
        setShowForm(false);
        void fetchMyLeaves(true);
      } else {
        const res = await fetch("/api/leaves/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            leaveType: formData.leaveType,
            fromDate: formData.startDate,
            toDate: formData.endDate,
            reason: formData.reason.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || data?.message || "Failed to submit leave");
          return;
        }
        const created = (data?.id ? data : data?.leave) as LeaveRecord | undefined;
        if (created?.id) {
          applyLeaves([created, ...myLeaves]);
        }
        setFormData({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });
        setShowForm(false);
        void fetchMyLeaves(true);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = (leave: LeaveRecord) => {
    const fromStr = leave.fromDate.toString().split("T")[0];
    const toStr = leave.toDate.toString().split("T")[0];
    setFormData({
      leaveType: leave.leaveType || "SICK",
      startDate: fromStr,
      endDate: toStr,
      reason: leave.reason || "",
    });
    setEditingLeave(leave);
    setError(null);
    setShowForm(true);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Do you really want to withdraw this leave request? This action cannot be undone.")) return;
    setError(null);
    const prev = myLeaves;
    const next = myLeaves.filter((l) => l.id !== id);
    applyLeaves(next);
    if (editingLeave?.id === id) {
      setEditingLeave(null);
      setShowForm(false);
      setFormData({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });
    }
    try {
      const res = await fetch(`/api/leaves/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        applyLeaves(prev);
        setError(data?.error || data?.message || "Failed to delete leave");
        return;
      }
      void fetchMyLeaves(true);
    } catch {
      applyLeaves(prev);
      setError("Something went wrong");
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 text-white pb-10">
      {/* 1. Header Section */}
      <PageHeader
        title={showForm ? (editingLeave ? "Edit Leave Request" : "Apply New Leave") : "My Leave Application"}
        subtitle={showForm ? "Please fill in the details below" : "Apply for leave and track your status"}
        rightSlot={
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 border border-[#b4f03d]/20 bg-[#b4f03d]/5 text-[#b4f03d] px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-bold text-xs md:text-sm hover:bg-[#b4f03d]/10 transition-all"
            >
              <Plus size={18} strokeWidth={3} />
              <span>New Leave</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingLeave(null);
                setFormData({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });
              }}
              className="flex items-center gap-2 border border-white/10 bg-white/5 text-white/60 px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-bold text-xs md:text-sm hover:bg-white/10 hover:text-white transition-all"
            >
              <ChevronDown size={18} strokeWidth={3} />
              <span>Cancel</span>
            </button>
          )
        }
      />
      {/* GLOBAL PAGE LOADING */}
      {loading && !showForm && myLeaves.length === 0 && (
        <TimellyLoader title="Loading leaves" steps={["Requests", "History", "Status"]} />
      )}


      {/* 2. The Form */}
      {showForm && (
        <div className="max-w-6xl mx-auto border border-white/10 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-2xl animate-in slide-in-from-top-2 duration-400 bg-white/[0.02] backdrop-blur-xl">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white ml-1">
                {editingLeave ? "Edit Leave Request" : "New Leave Request"}
              </h2>
              <div className="w-full h-px bg-white/10"></div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Leave Type</label>
                <div className="relative">
                  <select
                    className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-4 appearance-none text-white text-sm focus:outline-none focus:border-[#b4f03d]/50 cursor-pointer transition-all"
                    value={formData.leaveType}
                    onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
                  >
                    {LEAVE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-[#0f0f0f]">
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" size={16} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">From Date</label>
                <input
                  type="date"
                  required
                  className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#b4f03d]/50 [color-scheme:dark] transition-all"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">To Date</label>
                <input
                  type="date"
                  required
                  className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#b4f03d]/50 [color-scheme:dark] transition-all"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Reason for Leave</label>
              <textarea
                required
                placeholder="Provide a detailed reason..."
                rows={4}
                className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-[#b4f03d]/50 resize-none placeholder:text-white/20 transition-all"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitLoading}
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#b4f03d] text-black px-8 py-4 md:py-3 rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(180,240,61,0.2)] transition-all active:scale-95 disabled:opacity-60"
              >
                <CheckCircle size={18} strokeWidth={3} />
                <span>{submitLoading ? "Processing..." : (editingLeave ? "Update Application" : "Submit Application")}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Leave History Section */}
      {myLeaves.length > 0 && !showForm && (
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
                        onClick={() => handleEdit(leave)}
                        className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 rounded-xl text-xs font-bold transition-all"
                      >
                        <Edit3 size={14} />
                        Edit
                      </button>

                      <button
                        onClick={() => handleCancel(leave.id)}
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
                              <button onClick={() => handleEdit(leave)} className="p-2 text-white/40 hover:text-[#b4f03d] transition-all"><Edit3 size={18} /></button>
                              <button onClick={() => handleCancel(leave.id)} className="p-2 text-white/40 hover:text-red-400 transition-all"><XCircle size={18} /></button>
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
      )}

      {!loading && myLeaves.length === 0 && !showForm && (
        <div className="max-w-6xl mx-auto border border-white/10 rounded-[1.5rem] p-12 text-center text-white/40 bg-white/5 backdrop-blur-xl">
          <Clock className="mx-auto mb-4 opacity-20" size={48} />
          <p>No leave applications found. Apply your first leave today!</p>
        </div>
      )}
    </div>
  );
}
