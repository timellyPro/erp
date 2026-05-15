"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "../common/PageHeader";
import FeeStatCards from "./fees/FeeStatCards";
import AdmissionFeeDayReport from "./fees/AdmissionFeeDayReport";
import OfflinePaymentForm from "./fees/OfflinePaymentForm";
import AddExtraFeeForm from "./fees/AddExtraFeeForm";
import HostelMessFeesPanel from "./fees/HostelMessFeesPanel";
import ExtraFeeHeadTemplatesPanel from "./fees/ExtraFeeHeadTemplatesPanel";
import ExtraFeesList from "./fees/ExtraFeesList";
import FeeStructureConfig from "./fees/FeeStructureConfig";
import FeeRecordsTable from "./fees/FeeRecordsTable";
import FeeTransactionsList from "./fees/FeeTransactionsList";
import FeesSectionNav from "./fees/FeesSectionNav";
import PettyCashSection from "./fees/PettyCashSection";
import VoucherSection from "./fees/VoucherSection";
import type { Class, Student, FeeSummary, FeeRecord, FeeStructure, ExtraFee } from "./fees/types";
import Spinner from "../common/Spinner";

type FeesSection =
  | "overview"
  | "offline-payment"
  | "add-extra-fees"
  | "fee-structure"
  | "extra-fees-catalog"
  | "transactions"
  | "fees-records"
  | "petty-cash"
  | "voucher"
  | "student-fee-records";

type FeesTabProps = {
  section?: FeesSection;
};

export default function FeesTab({ section }: FeesTabProps) {
  const router = useRouter();
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [stats, setStats] = useState<FeeSummary | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [extraFees, setExtraFees] = useState<ExtraFee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, classesList, studentsList, structuresList, extraFeesList] =
        await Promise.allSettled([
          fetch("/api/fees/summary", { credentials: "include" }).then(async (r) => ({
            ok: r.ok,
            data: await r.json(),
          })),
          fetch("/api/class/list", { credentials: "include" }).then(async (r) => ({
            ok: r.ok,
            data: await r.json(),
          })),
          fetch("/api/student/list", { credentials: "include" }).then(async (r) => ({
            ok: r.ok,
            data: await r.json(),
          })),
          fetch("/api/fees/structure", { credentials: "include" }).then(async (r) => ({
            ok: r.ok,
            data: await r.json(),
          })),
          fetch("/api/fees/extra", { credentials: "include" }).then(async (r) => ({
            ok: r.ok,
            data: await r.json(),
          })),
        ]);

      if (summary.status === "fulfilled" && summary.value.ok) {
        setFees(summary.value.data.fees || []);
        setStats(summary.value.data.stats || null);
      }
      if (classesList.status === "fulfilled" && classesList.value.ok) {
        setClasses(classesList.value.data.classes || []);
      }
      if (studentsList.status === "fulfilled" && studentsList.value.ok) {
        setStudents(studentsList.value.data.students || []);
      }
      if (structuresList.status === "fulfilled" && structuresList.value.ok) {
        setStructures(structuresList.value.data.structures || []);
      }
      if (extraFeesList.status === "fulfilled" && extraFeesList.value.ok) {
        setExtraFees(
          Array.isArray(extraFeesList.value.data?.extraFees) ? extraFeesList.value.data.extraFees : []
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const reloadAfterMutation = useCallback(() => {
    void (async () => {
      await fetchData();
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    })();
  }, [router, fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden text-white">
      <div className="w-full space-y-4 px-3 pb-6 sm:space-y-6 sm:px-4 md:px-6">
        <PageHeader
          title="Fees Management"
          subtitle="Track and manage student fee payments with detailed breakdowns"
        />

        <FeesSectionNav />

        {(section === undefined || section === "overview") && (
          <div id="fees-section-overview" className="scroll-mt-28 space-y-6">
            <FeeStatCards stats={stats} />
            <AdmissionFeeDayReport />
          </div>
        )}

        {(section === undefined || section === "offline-payment" || section === "add-extra-fees") && (
          <div
            className={
              section === undefined
                ? "grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6"
                : section === "add-extra-fees"
                  ? "mx-auto w-full max-w-4xl"
                  : "mx-auto w-full max-w-3xl"
            }
          >
            {(section === undefined || section === "offline-payment") && (
              <div id="fees-section-offline-payment" className="scroll-mt-28 min-w-0">
                <OfflinePaymentForm
                  classes={classes}
                  structures={structures}
                  extraFees={extraFees}
                  students={students}
                  onSuccess={reloadAfterMutation}
                />
              </div>
            )}
            {(section === undefined || section === "add-extra-fees") && (
              <div
                id="fees-section-add-extra-fees"
                className={`scroll-mt-28 min-w-0 flex flex-col ${section === "add-extra-fees" ? "gap-6" : section === undefined ? "mt-4" : ""}`}
              >
                {section === "add-extra-fees" && (
                  <>
                    <HostelMessFeesPanel
                      classes={classes}
                      extraFees={extraFees}
                      schoolResidencyHeadName="Hostel Fee"
                      classHeadName="Mess Fee"
                      onSuccess={reloadAfterMutation}
                    />
                    <ExtraFeeHeadTemplatesPanel onSuccess={reloadAfterMutation} />
                  </>
                )}
                <AddExtraFeeForm classes={classes} students={students} onSuccess={reloadAfterMutation} />
              </div>
            )}
          </div>
        )}

        {(section === undefined || section === "fee-structure") && (
          <div id="fees-section-fee-structure" className="scroll-mt-28">
            <FeeStructureConfig
              classes={classes}
              structures={structures}
              onSuccess={reloadAfterMutation}
            />
          </div>
        )}

        {(section === undefined || section === "extra-fees-catalog") && (
          <div id="fees-section-extra-fees-catalog" className="scroll-mt-28">
            <ExtraFeesList
              extraFees={extraFees}
              classes={classes}
              students={students}
              onSuccess={reloadAfterMutation}
            />
          </div>
        )}

        {(section === undefined || section === "transactions") && (
          <div id="fees-section-transactions" className="scroll-mt-28">
            <FeeTransactionsList students={students} onSuccess={reloadAfterMutation} />
          </div>
        )}

        {(section === undefined || section === "student-fee-records" || section === "fees-records") && (
          <div id="fees-section-student-fee-records" className="scroll-mt-28">
            <FeeRecordsTable fees={fees} classes={classes} />
          </div>
        )}

        {(section === undefined || section === "petty-cash") && (
          <div
            id="fees-section-petty-cash"
            className={`scroll-mt-28 ${section === undefined ? "" : "w-full"}`}
          >
            <PettyCashSection />
          </div>
        )}

        {(section === undefined || section === "voucher") && (
          <div
            id="fees-section-voucher"
            className={`scroll-mt-28 ${section === undefined ? "" : "mx-auto w-full max-w-7xl"}`}
          >
            <VoucherSection classes={classes} students={students} onSuccess={reloadAfterMutation} />
          </div>
        )}
      </div>
    </div>
  );
}
