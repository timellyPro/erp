import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { StudentDetailsTabPayload } from "@/lib/students/buildStudentDetailsTabPayload";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import {
  invalidateStudentDetailsBundleCache,
  loadStudentDetailsBundle,
  refreshStudentFeesAfterMutation,
} from "@/lib/students/loadStudentDetailsBundle";
import {
  fetchFeeBreakdownFast,
  invalidateFeeBreakdownCache,
  setFeeBreakdownCache,
} from "@/lib/fees/feeBreakdownClientCache";
import { invalidateSchoolFeeClientCaches } from "@/lib/fees/invalidateSchoolFeeClientCaches";
import type { FeeDeleteSuccess, FeePaymentSuccess, StudentDetail } from "./types";
import {
  computeUpdatedFeeAfterDelete,
  patchBreakdownAfterDeletePayment,
  patchBreakdownAfterPayment,
  patchDetailAfterDelete,
  patchDetailAfterPayment,
} from "./studentDetailHelpers";

type SetDetail = (updater: StudentDetail | null | ((prev: StudentDetail | null) => StudentDetail | null)) => void;
type SetFeeBreakdown = (
  updater:
    | AdminStudentFeeBreakdownResult
    | null
    | ((prev: AdminStudentFeeBreakdownResult | null) => AdminStudentFeeBreakdownResult | null)
) => void;

export function useStudentFeeMutations({
  setDetail,
  setFeeBreakdown,
  setTransactionsReady,
  deletedPaymentIdsRef,
  selectedIdRef,
}: {
  setDetail: SetDetail;
  setFeeBreakdown: SetFeeBreakdown;
  setTransactionsReady: (ready: boolean) => void;
  deletedPaymentIdsRef: MutableRefObject<Set<string>>;
  selectedIdRef: MutableRefObject<string | null>;
}) {
  const applyDetailsBundle = useCallback(
    (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => {
      const { feeBreakdown: breakdown, ...rest } = bundle;
      if (rest?.student) {
        // Never paint another student's fees/payments onto the current selection.
        if (selectedIdRef.current && rest.student.id !== selectedIdRef.current) return;
        const payments = (rest.payments ?? []).filter(
          (p) => !deletedPaymentIdsRef.current.has(p.id)
        );
        const shell =
          breakdown && rest.fee
            ? {
                ...rest,
                payments,
                fee: {
                  ...rest.fee,
                  // Breakdown is current-year source of truth. Do not Math.max with shell
                  // amountPaid — shell includes previous-year payments and inflates "paid".
                  amountPaid: Number(breakdown.amountPaid) || 0,
                  remainingFee: Number(breakdown.remainingFee) || 0,
                  totalFee: breakdown.totalAmount ?? rest.fee.totalFee,
                },
              }
            : { ...rest, payments };
        setDetail(shell);
        setFeeBreakdown(breakdown ?? null);
        if (breakdown && rest.student.id) setFeeBreakdownCache(rest.student.id, breakdown);
        setTransactionsReady(true);
      } else {
        setDetail(null);
        setFeeBreakdown(null);
        setTransactionsReady(false);
      }
    },
    [deletedPaymentIdsRef, selectedIdRef, setDetail, setFeeBreakdown, setTransactionsReady]
  );

  const refreshFeesForStudent = useCallback(
    async (studentId: string, paymentResult?: FeePaymentSuccess) => {
      invalidateSchoolFeeClientCaches();
      if (paymentResult) {
        setTransactionsReady(true);
        setDetail((prev) => {
          const next = patchDetailAfterPayment(prev, paymentResult);
          if (next?.student.id === studentId) {
            void refreshStudentFeesAfterMutation(studentId, {
              keepShell: next as unknown as StudentDetailsTabPayload,
              keepPatchedBreakdown: true,
              optimisticPendingId: paymentResult.payment.id.startsWith("pending-")
                ? paymentResult.payment.id
                : undefined,
              onPartial: (partial) => {
                if (partial.student?.id === studentId) applyDetailsBundle(partial);
              },
            });
          }
          return next;
        });
        setFeeBreakdown((prev) => {
          const next = patchBreakdownAfterPayment(prev, paymentResult) ?? prev;
          if (next) setFeeBreakdownCache(studentId, next);
          return next;
        });
        return;
      }

      const bundle = await refreshStudentFeesAfterMutation(studentId, {
        onPartial: (partial) => {
          if (partial.student?.id === studentId) applyDetailsBundle(partial);
        },
      });
      if (bundle?.student?.id === studentId) {
        applyDetailsBundle(bundle);
      }
    },
    [applyDetailsBundle, setDetail, setFeeBreakdown, setTransactionsReady]
  );

  const removePaymentForStudent = useCallback(
    (studentId: string, deleteResult: FeeDeleteSuccess) => {
      deletedPaymentIdsRef.current.add(deleteResult.paymentId);
      invalidateSchoolFeeClientCaches();
      invalidateStudentDetailsBundleCache(studentId);
      invalidateFeeBreakdownCache(studentId);

      setDetail((prev) => {
        const deletedPayment = prev?.payments.find((p) => p.id === deleteResult.paymentId);
        const updatedFee =
          deleteResult.updatedFee ??
          (prev && deletedPayment ? computeUpdatedFeeAfterDelete(prev, deletedPayment) : null);
        const fullResult: FeeDeleteSuccess = {
          ...deleteResult,
          updatedFee,
          feeAllocations:
            deleteResult.feeAllocations ??
            (deletedPayment as { feeAllocations?: FeeDeleteSuccess["feeAllocations"] })
              ?.feeAllocations,
        };
        const next = patchDetailAfterDelete(prev, fullResult);
        setFeeBreakdown((bdPrev) => {
          if (!fullResult.updatedFee) return bdPrev;
          const nextBd = patchBreakdownAfterDeletePayment(
            bdPrev,
            fullResult.updatedFee,
            fullResult.feeAllocations
          );
          if (nextBd) setFeeBreakdownCache(studentId, nextBd);
          return nextBd ?? bdPrev;
        });
        return next;
      });

      void fetchFeeBreakdownFast(studentId, { force: true }).then((bd) => {
        if (!bd || selectedIdRef.current !== studentId) return;
        setFeeBreakdown(bd);
        setFeeBreakdownCache(studentId, bd);
      });
    },
    [deletedPaymentIdsRef, selectedIdRef, setDetail, setFeeBreakdown]
  );

  return { applyDetailsBundle, refreshFeesForStudent, removePaymentForStudent };
}
