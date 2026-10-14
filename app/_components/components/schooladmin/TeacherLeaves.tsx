"use client";
import TimellyLoader from "../common/TimellyLoader";
import {
  Clock,
  CheckCircle,
  UserCheck,
  FileText,
} from "lucide-react";
import PageHeader from "../common/PageHeader";
import { useTeacherLeavesState, IconTab, LeaveCardList, LeaveTable, ConditionalApprovalModal } from "./shared/teacher-leaves";

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
};

export default function SchoolTeacherLeavesTab() {
  const {
    pendingLeaves,
    allLeaves,
    activeTab,
    setActiveTab,
    loading,
    showConditionalModal,
    setShowConditionalModal,
    selectedLeaveId,
    setSelectedLeaveId,
    conditionalMessage,
    setConditionalMessage,
    actionId,
    currentMonthLabel,
    approveLeave,
    conditionalApproveLeave,
    rejectLeave,
    approvedToday,
    currentMonthLeaves,
    teachersOnLeaveToday,
    approvedLeaves,
    rejectedLeaves,
  } = useTeacherLeavesState();

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
        <ConditionalApprovalModal
          conditionalMessage={conditionalMessage}
          onConditionalMessageChange={setConditionalMessage}
          onCancel={() => setShowConditionalModal(false)}
          onConfirm={() => void conditionalApproveLeave()}
          confirmDisabled={actionId === selectedLeaveId}
        />
      )}
    </div>
  );
}
