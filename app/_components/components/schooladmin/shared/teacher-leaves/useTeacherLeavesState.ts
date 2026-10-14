import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadTeacherLeavesPage,
  peekTeacherLeavesPage,
  setTeacherLeavesPageCache,
  type LeaveStatus as Status,
  type SchoolAdminLeave as Leave,
} from "@/lib/school/loadSchoolAdminFastTabs";
import { approveTeacherLeave, rejectTeacherLeave } from "@/lib/api/teacherLeaves";

export function useTeacherLeavesState() {
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

  const isToday = useCallback(
    (date?: string | null) => {
      if (!date) return false;
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    },
    [today]
  );

  const isTodayBetween = useCallback(
    (from: string, to: string) => {
      const f = new Date(from);
      const t = new Date(to);
      f.setHours(0, 0, 0, 0);
      t.setHours(0, 0, 0, 0);
      return today >= f && today <= t;
    },
    [today]
  );

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
      const { ok } = await approveTeacherLeave(id, "FULL");

      if (ok) {
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
      const { ok } = await approveTeacherLeave(selectedLeaveId, "CONDITIONAL", conditionalMessage);

      if (ok) {
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
      const { ok } = await rejectTeacherLeave(id, "Rejected by admin");

      if (ok) {
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
    [allLeaves, isToday]
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
    [allLeaves, isTodayBetween]
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

  return {
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
  };
}
