"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "../common/PageHeader";
import FeeStatCards from "./fees/FeeStatCards";
import OfflinePaymentForm from "./fees/OfflinePaymentForm";
import AddExtraFeeForm from "./fees/AddExtraFeeForm";
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, clsRes, stuRes, structRes, extraRes] = await Promise.all([
        fetch("/api/fees/summary"),
        fetch("/api/class/list"),
        fetch("/api/student/list"),
        fetch("/api/fees/structure"),
        fetch("/api/fees/extra"),
      ]);
      const [sumData, clsData, stuData, structData, extraData] = await Promise.all([
        sumRes.json(),
        clsRes.json(),
        stuRes.json(),
        structRes.json(),
        extraRes.json(),
      ]);

      if (sumRes.ok) {
        setFees(sumData.fees || []);
        setStats(sumData.stats || null);
      }
      if (clsRes.ok) setClasses(clsData.classes || []);
      if (stuRes.ok) setStudents(stuData.students || []);
      if (structRes.ok) setStructures(structData.structures || []);
      if (extraRes.ok) setExtraFees(Array.isArray(extraData?.extraFees) ? extraData.extraFees : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const reloadAfterMutation = useCallback(() => {
    void (async () => {
      await fetchData();
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <Spinner/>
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
          <div id="fees-section-overview" className="scroll-mt-28">
            <FeeStatCards stats={stats} />
          </div>
        )}

        {(section === undefined || section === "offline-payment" || section === "add-extra-fees") && (
          <div
            className={
              section === undefined
                ? "grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6"
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
                className={`scroll-mt-28 min-w-0 ${section === undefined ? "" : "mt-4"}`}
              >
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
            className={`scroll-mt-28 ${section === undefined ? "" : "mx-auto w-full max-w-4xl"}`}
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
