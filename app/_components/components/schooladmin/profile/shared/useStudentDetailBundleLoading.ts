import { useCallback, useEffect, type MutableRefObject } from "react";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { loadStudentDetailsBundle, peekStudentDetailsBundle } from "@/lib/students/loadStudentDetailsBundle";
import { getFeeBreakdownCached, fetchFeeBreakdownFast } from "@/lib/fees/feeBreakdownClientCache";
import { invalidateStudentDetailsBundleCache } from "@/lib/students/loadStudentDetailsBundle";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderById, buildPlaceholderDetail, normalizeStudentOption, patchDetailShell } from "./studentDetailHelpers";

export function useStudentDetailBundleLoading({
  selectedId,
  selectedIdRef,
  students,
  setStudents,
  detail,
  setDetail,
  feeBreakdown,
  setFeeBreakdown,
  setFeeBreakdownPending,
  setTransactionsReady,
  reloadKey,
  applyDetailsBundle,
}: {
  selectedId: string | null;
  selectedIdRef: MutableRefObject<string | null>;
  students: StudentOption[];
  setStudents: React.Dispatch<React.SetStateAction<StudentOption[]>>;
  detail: StudentDetail | null;
  setDetail: React.Dispatch<React.SetStateAction<StudentDetail | null>>;
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
  setFeeBreakdown: React.Dispatch<React.SetStateAction<AdminStudentFeeBreakdownResult | null>>;
  setFeeBreakdownPending: React.Dispatch<React.SetStateAction<boolean>>;
  setTransactionsReady: React.Dispatch<React.SetStateAction<boolean>>;
  reloadKey: number;
  applyDetailsBundle: (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => void;
}) {
  const warmFeeBreakdown = useCallback(() => {
    if (!selectedId) return;
    const requestId = selectedId;
    const shellPaid = Number(detail?.fee?.amountPaid) || 0;
    const cached = getFeeBreakdownCached(requestId);
    if (cached && cached.amountPaid + 0.02 >= shellPaid) {
      if (selectedIdRef.current === requestId) {
        setFeeBreakdown(cached);
        setFeeBreakdownPending(false);
      }
      return;
    }
    if (feeBreakdown && feeBreakdown.amountPaid + 0.02 >= shellPaid) return;
    void fetchFeeBreakdownFast(requestId, {
      force: Boolean(cached && shellPaid > cached.amountPaid + 0.02),
      minAmountPaid: shellPaid,
    }).then((breakdown) => {
      if (!breakdown || selectedIdRef.current !== requestId) return;
      setFeeBreakdown(breakdown);
      setFeeBreakdownPending(false);
    });
  }, [selectedId, selectedIdRef, feeBreakdown, detail?.fee?.amountPaid, setFeeBreakdown, setFeeBreakdownPending]);

  useEffect(() => {
    if (reloadKey === 0) return;
    const id = selectedIdRef.current;
    if (id) invalidateStudentDetailsBundleCache(id);
  }, [reloadKey, selectedIdRef]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setFeeBreakdown(null);
      setFeeBreakdownPending(false);
      setTransactionsReady(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const requestId = selectedId;

    const cachedBreakdown = getFeeBreakdownCached(requestId);
    const cachedBundle = reloadKey === 0 ? peekStudentDetailsBundle(requestId) : null;
    if (cachedBundle?.student) {
      applyDetailsBundle(cachedBundle);
    } else {
      setTransactionsReady(false);
      setDetail((prev) => {
        if (prev?.student.id === requestId) return prev;
        const fromList = students.find((s) => s.id === requestId);
        return fromList
          ? buildPlaceholderDetail(normalizeStudentOption(fromList))
          : buildPlaceholderById(requestId);
      });
    }
    if (cachedBreakdown) {
      setFeeBreakdown(cachedBreakdown);
      setFeeBreakdownPending(false);
    } else {
      // Clear previous student's fees immediately — never show A while loading B.
      setFeeBreakdown(null);
      setFeeBreakdownPending(true);
    }

    loadStudentDetailsBundle(requestId, {
      force: reloadKey > 0,
      signal: controller.signal,
      onShellLoaded: (partial) => {
        if (cancelled || selectedIdRef.current !== requestId) return;
        const { feeBreakdown: bd, ...rest } = partial;
        if (rest?.student?.id === requestId) {
          setDetail((prev) => patchDetailShell(prev, rest as StudentDetail));
          setStudents((prev) => {
            const row = normalizeStudentOption({
              id: rest.student.id,
              name: rest.student.name,
              admissionNumber: rest.student.admissionNumber,
              fatherName: rest.student.fatherName,
              classDisplay: rest.student.class?.displayName,
              classId: rest.student.class?.id,
              section: rest.student.class?.section,
              status: rest.student.status,
            });
            if (prev.some((s) => s.id === rest.student.id)) {
              return prev.map((s) => (s.id === rest.student.id ? { ...s, ...row } : s));
            }
            return [row, ...prev];
          });
        }
        if (bd) {
          setFeeBreakdown(bd);
          setFeeBreakdownPending(false);
        }
      },
      onBreakdownLoaded: (bd) => {
        if (cancelled || selectedIdRef.current !== requestId) return;
        setFeeBreakdown(bd);
        setFeeBreakdownPending(false);
      },
      onExtrasLoaded: (full) => {
        if (cancelled || selectedIdRef.current !== requestId) return;
        applyDetailsBundle(full);
      },
    })
      .then((bundle) => {
        if (cancelled || selectedIdRef.current !== requestId) return;
        applyDetailsBundle(bundle);
      })
      .catch((err) => {
        if (cancelled || selectedIdRef.current !== requestId) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Student details error:", err);
      })
      .finally(() => {
        if (!cancelled && selectedIdRef.current === requestId) {
          setFeeBreakdownPending(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `students` read for placeholder only — must not restart fetch when list hydrates
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [selectedId, reloadKey, applyDetailsBundle]);

  return { warmFeeBreakdown };
}
