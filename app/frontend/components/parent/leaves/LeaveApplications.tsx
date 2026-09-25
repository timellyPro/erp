"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  ChevronDown,
  Plus,
  CheckCircle,
  Clock,
  Info,
  Upload,
  Send,
  File
} from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentTimellyLoader from "../ParentTimellyLoader";

const LEAVE_TYPE_OPTIONS = [
  { label: "Sick Leave", value: "SICK" },
  { label: "Casual Leave", value: "CASUAL" },
  { label: "Emergency Leave", value: "UNPAID" },
  { label: "Duty Leave", value: "PAID" },
];

type LeaveRecord = {
  id: string;
  leaveType: string;
  reason: string | null;
  fromDate: string;
  toDate: string;
  status: string;
  remarks: string | null;
  createdAt: string;
};

type ApprovalAuthority = {
  teacherName: string;
  photoUrl: string;
  className: string;
  section: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function leaveTypeLabel(t: string) {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function statusStyle(s: string) {
  if (s === "APPROVED" || s === "CONDITIONALLY_APPROVED")
    return "bg-[#b4f03d]/10 text-[#b4f03d] border-[#b4f03d]/30";
  if (s === "REJECTED") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
}

export default function ParentLeavesTab() {
  const [activeTab, setActiveTab] = useState<"NEW" | "HISTORY">("NEW");
  const [formData, setFormData] = useState({
    leaveType: "SICK",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalAuthority, setApprovalAuthority] = useState<ApprovalAuthority | null>(null);
  const [approvalAuthorityLoaded, setApprovalAuthorityLoaded] = useState(false);

  const fetchMyLeaves = useCallback(async () => {
    try {
      const res = await fetch("/api/student-leaves/my");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setMyLeaves(data);
      else setMyLeaves([]);
    } catch {
      setMyLeaves([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApprovalAuthority = useCallback(async () => {
    try {
      const res = await fetch("/api/student-leaves/approval-authority", {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data && (data.teacherId != null || data.teacherName != null)) {
        setApprovalAuthority({
          teacherName: data.teacherName ?? "Class Teacher",
          photoUrl: data.photoUrl ?? "",
          className: data.className ?? "-",
          section: data.section ?? "",
        });
      } else {
        setApprovalAuthority(null);
      }
    } catch {
      setApprovalAuthority(null);
    } finally {
      setApprovalAuthorityLoaded(true);
    }
  }, []);



  useEffect(() => {
    fetchMyLeaves();
    fetchApprovalAuthority();
  }, [fetchMyLeaves, fetchApprovalAuthority]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate || !formData.reason?.trim()) {
      setError("Please fill From Date, To Date and Reason.");
      return;
    }
    setError(null);
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/student-leaves/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveType: formData.leaveType,
          fromDate: formData.startDate,
          toDate: formData.endDate,
          reason: formData.reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to submit leave");
        return;
      }
      if (data?.leave) {
        setMyLeaves((prev) => [
          {
            id: String(data.leave.id ?? ""),
            leaveType: String(data.leave.leaveType ?? formData.leaveType),
            reason: data.leave.reason ?? formData.reason.trim(),
            fromDate:
              typeof data.leave.fromDate === "string"
                ? data.leave.fromDate
                : formData.startDate,
            toDate:
              typeof data.leave.toDate === "string"
                ? data.leave.toDate
                : formData.endDate,
            status: String(data.leave.status ?? "PENDING"),
            remarks: data.leave.remarks ?? null,
            createdAt:
              typeof data.leave.createdAt === "string"
                ? data.leave.createdAt
                : new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setFormData({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });
      setActiveTab("HISTORY");
      void fetchMyLeaves();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitLoading(false);
    }
  };

  const leavesTaken = myLeaves.filter(l => l.status === "APPROVED").length;
  const pendingRequests = myLeaves.filter(l => l.status === "PENDING").length;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="Leave Application"
          subtitle="Apply for leave and track your application status. Requests are sent directly to your class teacher for approval."
          icon={<Calendar className="text-[#b4ff39]" size={28} />}
        />

        {/* Navigation Tabs - Responsive adjustment: Removed hardcoded margin */}
        <div className="flex justify-center md:justify-start gap-8 md:ml-90 mb-8 border-b border-white/5">
          <button
            onClick={() => setActiveTab("NEW")}
            className={`pb-4 text-sm font-bold transition-all ${activeTab === "NEW" ? "text-[#b4f03d] border-b-2 border-[#b4f03d]" : "text-white/40"}`}
          >
            New Application
          </button>
          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`pb-4 text-sm font-bold transition-all ${activeTab === "HISTORY" ? "text-[#b4f03d] border-b-2 border-[#b4f03d]" : "text-white/40"}`}
          >
            Application History
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT SIDEBAR: Stats & Authority */}
          <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
            {/* Leave Summary */}
            <div className="somu rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-6 text-white/70">
                <Clock size={18} className="text-[#b4f03d]" />
                <h3 className="text-sm  uppercase tracking-wider">Leave Summary</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl py-2 border border-white/10 text-center">
                  <div className="text-3xl  mb-1 text-white text-start pl-4">{leavesTaken}</div>
                  <div className="text-[10px] text-white/40 uppercase text-start pl-4">Leaves Taken</div>
                </div>
                <div className="bg-white/5 rounded-2xl py-2 border border-white/10 text-center">
                  <div className="text-3xl  mb-1 text-orange-400 text-start pl-4">{pendingRequests}</div>
                  <div className="text-[10px] text-white/40 uppercase text-start pl-4">Pending Requests</div>
                </div>
              </div>
            </div>

            {/* Approval Authority */}
            <div className="somu rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-6 text-white/70">
                <File size={18} className="text-[#b4f03d]" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Approval Authority</h3>
              </div>
              {!approvalAuthorityLoaded ? (
                <ParentTimellyLoader preset="leave" compact className="w-full" />
              ) : approvalAuthority ? (
                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#b4f03d]/30 shrink-0 bg-white/10">
                    {approvalAuthority.photoUrl ? (
                      <img
                        src={approvalAuthority.photoUrl}
                        alt={approvalAuthority.teacherName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#b4f03d] text-xl font-bold">
                        {approvalAuthority.teacherName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-base">{approvalAuthority.teacherName}</div>
                    <div className="text-xs text-white/40">Class Teacher ({approvalAuthority.className}{approvalAuthority.section ? `-${approvalAuthority.section}` : ""})</div>
                    <div className="mt-2 text-[10px] bg-[#b4f03d]/10 text-[#b4f03d] px-2 py-1 rounded-full font-bold inline-block">
                      Usually replies in 24 hrs
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center text-sm text-white/50">
                  Approval authority not available. Your class teacher may not be assigned yet—contact the school office.
                </div>
              )}
            </div>

            {/* Important Note */}
            <div className="somu rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-3 text-yellow-400">
                <Info size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider">Important Note</h3>
              </div>
              <p className="text-xs leading-relaxed text-white/50 font-medium">
                For sick leaves exceeding 2 days, a medical certificate must be attached or submitted to the class teacher upon return.
              </p>
            </div>
          </div>

          {/* RIGHT CONTENT: Form or History */}
          <div className="lg:col-span-8 order-1 lg:order-2">
            {activeTab === "NEW" ? (
              <div className="somu rounded-3xl p-6 md:p-10 shadow-2xl">
                <form className="space-y-8" onSubmit={handleSubmit}>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">Leave Type</label>
                      <div className="relative">
                        <select
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-5 appearance-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#b4f03d]/20 transition-all cursor-pointer"
                          value={formData.leaveType}
                          onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
                        >
                          {LEAVE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" size={18} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">From Date</label>
                      <input
                        type="date"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#b4f03d]/20 [color-scheme:dark]"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">To Date</label>
                      <input
                        type="date"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#b4f03d]/20 [color-scheme:dark]"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">Reason for Leave</label>
                    <textarea
                      placeholder="Please explain why you need to take leave..."
                      className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#b4f03d]/20 resize-none placeholder:text-white/20"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="submit"
                      disabled={submitLoading}
                      className="w-full md:w-auto flex items-center justify-center gap-3 bg-[#b4f03d] text-black px-10 py-4 rounded-full font-black text-sm hover:scale-105 transition-all active:scale-95 disabled:opacity-50 shadow-[0_10px_30px_rgba(180,240,61,0.3)]"
                    >
                      <Send size={18} />
                      {submitLoading ? "SUBMITTING..." : "SUBMIT APPLICATION"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* HISTORY LIST */
              <div className="space-y-4">
                {loading ? (
                  <ParentTimellyLoader preset="leave" compact className="w-full" />
                ) : myLeaves.length === 0 ? (
                  <div className="somu border border-white/5 rounded-3xl p-20 text-center">
                    <p className="text-white/40 font-bold">No leave history found.</p>
                  </div>
                ) : (
                  myLeaves.map((leave) => (
                    <div key={leave.id} className="somu border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row justify-between gap-4 transition-all hover:bg-white/[0.08]">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className="font-bold text-lg">{leaveTypeLabel(leave.leaveType)}</span>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${statusStyle(leave.status)}`}>
                            {leave.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 font-medium">
                          {formatDate(leave.fromDate)} — {formatDate(leave.toDate)}
                        </p>
                        <p className="text-sm text-white/40 italic mt-3 leading-relaxed">"{leave.reason}"</p>
                      </div>

                      <div className="md:text-right flex flex-col justify-center border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                        {leave.remarks ? (
                          <>
                            <div className="text-[10px] text-white/30 uppercase font-bold mb-1 tracking-widest">Teacher Remarks</div>
                            <p className="text-xs text-[#b4f03d]/70 font-bold leading-relaxed">{leave.remarks}</p>
                          </>
                        ) : (
                          leave.status === "APPROVED" && (
                            <div className="flex items-center md:justify-end gap-1.5 text-[10px] text-[#b4f03d]/60 font-black uppercase tracking-widest">
                              <CheckCircle size={14} />
                              Verified
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}