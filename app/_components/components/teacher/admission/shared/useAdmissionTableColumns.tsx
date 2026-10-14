import { useCallback, useMemo } from "react";
import { CheckCircle, Pencil, Printer, Trash2, UserPlus, Loader2, IndianRupee } from "lucide-react";
import { classLabel, displayResidencyType, formatBoardingLabel, formatInrCell } from "./utils";
import type { Column } from "../../../../types/superadmin";
import type { AdmissionRow, FeeType } from "./types";

export function useAdmissionTableColumns({
  workflowBusyId,
  setPaymentForm,
  setPaymentDialog,
  printFeeReceipt,
  enrollFromRow,
  warmAssignCatalog,
  openAssignFeesDialog,
  router,
  setDeleteRow,
  goToStudentDetails,
}: {
  workflowBusyId: string | null;
  setPaymentForm: (form: { paymentMode: string; paymentMethod: string; referenceNo: string; remarks: string }) => void;
  setPaymentDialog: (dialog: { row: AdmissionRow; feeType: FeeType } | null) => void;
  printFeeReceipt: (row: AdmissionRow, feeType: FeeType) => void;
  enrollFromRow: (row: AdmissionRow) => void;
  warmAssignCatalog: (row: AdmissionRow) => void;
  openAssignFeesDialog: (row: AdmissionRow) => void;
  router: { push: (url: string) => void };
  setDeleteRow: (row: AdmissionRow) => void;
  goToStudentDetails: (row: AdmissionRow) => void;
}) {
  const renderAdmissionActions = useCallback(
    (r: AdmissionRow) => {
      const busy = workflowBusyId === r.id;
      const enrolled = Boolean(r.studentId);
      const openPay = (feeType: FeeType) => {
        setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
        setPaymentDialog({ row: r, feeType });
      };
      return (
        <div className="flex flex-wrap items-center gap-1 w-[10.5rem]">
          {Number(r.applicationFee ?? 0) > 0 &&
            (r.applicationFeePaid ? (
              <button
                type="button"
                onClick={() => printFeeReceipt(r, "APPLICATION")}
                className="inline-flex items-center justify-center rounded-md border border-lime-400/25 bg-lime-400/10 p-1.5 text-lime-300 hover:bg-lime-400/20"
                title="Print application fee receipt"
              >
                <Printer size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openPay("APPLICATION")}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 hover:bg-amber-500/20"
                title="Pay application fee"
              >
                App
              </button>
            ))}
          {Number(r.admissionFee ?? 0) > 0 &&
            (r.admissionFeePaid ? (
              <button
                type="button"
                onClick={() => printFeeReceipt(r, "ADMISSION")}
                className="inline-flex items-center justify-center rounded-md border border-lime-400/25 bg-lime-400/10 p-1.5 text-lime-300 hover:bg-lime-400/20"
                title="Print admission fee receipt"
              >
                <Printer size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openPay("ADMISSION")}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 hover:bg-amber-500/20"
                title="Pay admission fee"
              >
                Adm
              </button>
            ))}
          {!enrolled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => enrollFromRow(r)}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[9px] font-semibold bg-lime-400/20 border border-lime-400/35 text-lime-200 hover:bg-lime-400/30 disabled:opacity-50"
              title="Approve to create the student"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              {busy ? "…" : "Approve"}
            </button>
          )}
          {enrolled && (
            <button
              type="button"
              onMouseEnter={() => warmAssignCatalog(r)}
              onFocus={() => warmAssignCatalog(r)}
              onClick={() => openAssignFeesDialog(r)}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[9px] font-semibold bg-sky-500/20 border border-sky-500/35 text-sky-100 hover:bg-sky-500/30"
              title="Assign extra fees"
            >
              <IndianRupee size={12} />
              Fees
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(`?tab=admission&view=add&editId=${r.id}`)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
            title={enrolled ? "View / edit application" : "Edit application"}
          >
            <Pencil size={14} />
          </button>
          {!enrolled && (
            <button
              type="button"
              onClick={() => setDeleteRow(r)}
              className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20"
              title="Delete application"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      );
    },
    [router, printFeeReceipt, enrollFromRow, workflowBusyId, warmAssignCatalog, openAssignFeesDialog, setDeleteRow, setPaymentForm, setPaymentDialog]
  );

  const tableColumns: Column<AdmissionRow>[] = useMemo(
    () => [
      { header: "Actions", render: renderAdmissionActions },
      {
        header: "Application no.",
        render: (r: AdmissionRow) => (
          <span className="text-sm font-mono text-white/85">{r.applicationNo || "—"}</span>
        ),
      },
      {
        header: "Applicant",
        render: (r: AdmissionRow) => {
          const name = `${r.firstName} ${r.lastName}`.trim() || "—";
          const canOpen = Boolean(r.studentId);
          return (
            <button
              type="button"
              onDoubleClick={() => goToStudentDetails(r)}
              disabled={!canOpen}
              title={
                canOpen
                  ? "Double-click to open Student Details"
                  : "Enroll this applicant first to open Student Details"
              }
              className={`text-left text-sm max-w-[14rem] truncate ${
                canOpen
                  ? "text-sky-200 hover:text-sky-100 hover:underline cursor-pointer"
                  : "text-white/80 cursor-default"
              }`}
            >
              {name}
            </button>
          );
        },
      },
      {
        header: "Class",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{classLabel(r)}</span>
        ),
      },
      {
        header: "Boarding",
        render: (r: AdmissionRow) => (
          <div className="text-xs text-white/70 leading-snug">
            <div>{formatBoardingLabel(r.boardingType)}</div>
            <div className="text-white/50">{displayResidencyType(r.residencyType)}</div>
          </div>
        ),
      },
      {
        header: "Parent",
        render: (r: AdmissionRow) => (
          <div className="text-sm text-white/70">
            <div className="text-white/80">{r.parentName}</div>
            <div className="text-xs text-white/50">{r.parentPhone}</div>
          </div>
        ),
      },
      {
        header: "Fees",
        render: (r: AdmissionRow) => (
          <span className="text-xs text-white/65 whitespace-nowrap">
            App {formatInrCell(r.applicationFee)} · Adm {formatInrCell(r.admissionFee)}
          </span>
        ),
      },
      {
        header: "Status",
        render: (r: AdmissionRow) => {
          if (r.studentId) {
            return (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle size={12} />
                Enrolled
              </span>
            );
          }
          const wf = r.workflowStatus ?? "PENDING";
          if (wf === "UPCOMING") {
            return (
              <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/30">
                Upcoming
              </span>
            );
          }
          return (
            <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/25">
              Pending
            </span>
          );
        },
      },
      {
        header: "Applied",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/60 whitespace-nowrap">
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [renderAdmissionActions, goToStudentDetails]
  );

  return { tableColumns };
}
