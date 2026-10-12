import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  loadTeacherMyLeaves,
  peekTeacherMyLeaves,
  setTeacherMyLeavesCache,
  type TeacherMyLeave,
} from "@/lib/teacher/loadTeacherFastTabs";

export type LeaveRecord = TeacherMyLeave;

const blankForm = () => ({ leaveType: "SICK", startDate: "", endDate: "", reason: "" });

export function useTeacherLeaveState() {
  const initial = peekTeacherMyLeaves();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(blankForm());
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
        setFormData(blankForm());
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
        setFormData(blankForm());
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
      setFormData(blankForm());
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

  const closeForm = () => {
    setShowForm(false);
    setEditingLeave(null);
    setFormData(blankForm());
  };

  return {
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
  };
}
