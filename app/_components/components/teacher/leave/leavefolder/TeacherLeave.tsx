import { ChevronDown, Clock, Plus } from "lucide-react";
import PageHeader from "../../../common/PageHeader";
import TimellyLoader from "../../../common/TimellyLoader";
import { useTeacherLeaveState } from "./shared";
import { LeaveApplicationForm } from "./shared";
import { LeaveHistorySection } from "./shared";

export default function TeacherLeave() {
  const {
    showForm,
    setShowForm,
    formData,
    setFormData,
    myLeaves,
    loading,
    submitLoading,
    error,
    editingLeave,
    handleSubmit,
    handleEdit,
    handleCancel,
    closeForm,
  } = useTeacherLeaveState();

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
              onClick={closeForm}
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
        <LeaveApplicationForm
          editingLeave={editingLeave}
          error={error}
          formData={formData}
          setFormData={setFormData}
          submitLoading={submitLoading}
          onSubmit={handleSubmit}
        />
      )}

      {/* 3. Leave History Section */}
      {myLeaves.length > 0 && !showForm && (
        <LeaveHistorySection myLeaves={myLeaves} onEdit={handleEdit} onCancel={handleCancel} />
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
