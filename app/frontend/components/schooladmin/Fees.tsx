"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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
import type { Class, Student, FeeSummary, FeeRecord, FeeStructure, ExtraFee } from "./fees/types";
import Spinner from "../common/Spinner";
import {
  feesPageReady,
  feesRequirementsForSection,
  type FeesSection,
} from "@/lib/feesPageRequirements";
import { invalidateFeesTransactionsCache } from "@/lib/feesTransactionsCache";
import {
  invalidateSchoolFeesPageCache,
  loadSchoolFeesPage,
  peekLastFeesSchoolId,
  peekSchoolFeesPageForSection,
  warmSchoolFeesPage,
} from "@/lib/loadSchoolFeesPage";

type FeesTabProps = {
  section?: FeesSection;
};

function SectionLoader() {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-white/10 bg-white/5">
      <Spinner />
    </div>
  );
}

function applySnapshot(
  snap: Awaited<ReturnType<typeof loadSchoolFeesPage>>,
  setters: {
    setFees: (v: FeeRecord[]) => void;
    setFeeRecords: (v: FeeRecord[] | null) => void;
    setStats: (v: FeeSummary | null) => void;
    setClasses: (v: Class[] | null) => void;
    setStudents: (v: Student[] | null) => void;
    setStructures: (v: FeeStructure[] | null) => void;
    setExtraFees: (v: ExtraFee[] | null) => void;
  }
) {
  setters.setFees(snap.fees);
  setters.setStats(snap.stats);
  if (snap.feeRecords !== null) setters.setFeeRecords(snap.feeRecords);
  if (snap.classes !== null) setters.setClasses(snap.classes);
  if (snap.students !== null) setters.setStudents(snap.students);
  if (snap.structures !== null) setters.setStructures(snap.structures);
  if (snap.extraFees !== null) setters.setExtraFees(snap.extraFees);
}

export default function FeesTab({ section }: FeesTabProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const schoolId = session?.user?.schoolId ?? null;
  const req = useMemo(() => feesRequirementsForSection(section), [section]);

  const initialSnap = peekSchoolFeesPageForSection(
    schoolId ?? peekLastFeesSchoolId(),
    section
  );
  const pettyCashOnly = section === "petty-cash";

  const [fees, setFees] = useState<FeeRecord[]>(initialSnap?.fees ?? []);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[] | null>(initialSnap?.feeRecords ?? null);
  const [stats, setStats] = useState<FeeSummary | null>(initialSnap?.stats ?? null);
  const [classes, setClasses] = useState<Class[] | null>(initialSnap?.classes ?? null);
  const [students, setStudents] = useState<Student[] | null>(initialSnap?.students ?? null);
  const [structures, setStructures] = useState<FeeStructure[] | null>(initialSnap?.structures ?? null);
  const [extraFees, setExtraFees] = useState<ExtraFee[] | null>(initialSnap?.extraFees ?? null);

  const setters = {
    setFees,
    setFeeRecords,
    setStats,
    setClasses,
    setStudents,
    setStructures,
    setExtraFees,
  };

  const sectionReady = useMemo(
    () =>
      pettyCashOnly ||
      feesPageReady(req, {
        stats,
        feeRecords: req.feeRecords ? feeRecords : null,
        classes: req.classes ? classes : null,
        students: req.students ? students : null,
        structures: req.structures ? structures : null,
        extraFees: req.extraFees ? extraFees : null,
      }),
    [pettyCashOnly, req, stats, feeRecords, classes, students, structures, extraFees]
  );

  const fetchData = useCallback(
    async (options?: { revalidate?: boolean }) => {
      try {
        const snap = await loadSchoolFeesPage(section, {
          schoolId,
          revalidate: options?.revalidate,
        });
        applySnapshot(snap, setters);
      } catch (e) {
        console.error(e);
      }
    },
    [schoolId, section]
  );

  useEffect(() => {
    if (pettyCashOnly) return;
    const cached = peekSchoolFeesPageForSection(schoolId, section);
    if (cached) applySnapshot({ ...cached, fromCache: true }, setters);

    const controller = new AbortController();
    void loadSchoolFeesPage(section, {
      schoolId,
      revalidate: true,
      signal: controller.signal,
    })
      .then((snap) => applySnapshot(snap, setters))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
      });
    return () => controller.abort();
  }, [schoolId, section, pettyCashOnly]);

  useEffect(() => {
    if (schoolId) warmSchoolFeesPage(schoolId);
  }, [schoolId]);

  const reloadAfterMutation = useCallback(() => {
    void (async () => {
      if (schoolId) {
        invalidateSchoolFeesPageCache(schoolId);
        invalidateFeesTransactionsCache(schoolId);
      }
      await fetchData({ revalidate: true });
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    })();
  }, [router, fetchData, schoolId]);

  const recordsForTable = req.feeRecords ? (feeRecords ?? []) : fees;
  const classesList = classes ?? [];
  const studentsList = students ?? [];
  const structuresList = structures ?? [];
  const extraFeesList = extraFees ?? [];

  return (
    <div className="min-h-screen w-full overflow-x-hidden text-white">
      <div className="w-full space-y-4 px-3 pb-6 sm:space-y-6 sm:px-4 md:px-6">
        <PageHeader
          title="Fees Management"
          subtitle="Track and manage student fee payments with detailed breakdowns"
        />

        <FeesSectionNav schoolId={schoolId} />

        {(section === undefined || section === "overview") && (
          <div id="fees-section-overview" className="scroll-mt-28 space-y-6">
            {!sectionReady && req.summary ? (
              <SectionLoader />
            ) : (
              <FeeStatCards stats={stats} />
            )}
            <AdmissionFeeDayReport />
          </div>
        )}

        {(section === undefined || section === "offline-payment" || section === "add-extra-fees") && (
          <div
            className={
              section === undefined
                ? "grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6"
                : section === "add-extra-fees"
                  ? "mx-auto w-full max-w-6xl"
                  : "mx-auto w-full max-w-3xl"
            }
          >
            {(section === undefined || section === "offline-payment") && (
              <div id="fees-section-offline-payment" className="scroll-mt-28 min-w-0">
                {!sectionReady && section === "offline-payment" ? (
                  <SectionLoader />
                ) : (
                  <OfflinePaymentForm
                    classes={classesList}
                    structures={structuresList}
                    extraFees={extraFeesList}
                    students={studentsList}
                    onSuccess={reloadAfterMutation}
                  />
                )}
              </div>
            )}
            {(section === undefined || section === "add-extra-fees") && (
              <div
                id="fees-section-add-extra-fees"
                className={`scroll-mt-28 min-w-0 flex flex-col ${section === "add-extra-fees" ? "gap-6" : section === undefined ? "mt-4" : ""}`}
              >
                {section === "add-extra-fees" && (
                  <>
                    {!sectionReady ? (
                      <SectionLoader />
                    ) : (
                      <>
                        <HostelMessFeesPanel
                          classes={classesList}
                          extraFees={extraFeesList}
                          schoolResidencyHeadName="Hostel Fee"
                          classHeadName="Mess Fee"
                          onSuccess={reloadAfterMutation}
                        />
                        <ExtraFeeHeadTemplatesPanel onSuccess={reloadAfterMutation} />
                      </>
                    )}
                  </>
                )}
                {section === "add-extra-fees" && !sectionReady ? null : (
                  <AddExtraFeeForm classes={classesList} students={studentsList} onSuccess={reloadAfterMutation} />
                )}
              </div>
            )}
          </div>
        )}

        {(section === undefined || section === "fee-structure") && (
          <div id="fees-section-fee-structure" className="scroll-mt-28">
            {!sectionReady && section === "fee-structure" ? (
              <SectionLoader />
            ) : (
              <FeeStructureConfig
                classes={classesList}
                structures={structuresList}
                onSuccess={reloadAfterMutation}
              />
            )}
          </div>
        )}

        {(section === undefined || section === "extra-fees-catalog") && (
          <div id="fees-section-extra-fees-catalog" className="scroll-mt-28">
            {!sectionReady && section === "extra-fees-catalog" ? (
              <SectionLoader />
            ) : (
              <ExtraFeesList
                extraFees={extraFeesList}
                classes={classesList}
                students={studentsList}
                onSuccess={reloadAfterMutation}
              />
            )}
          </div>
        )}

        {(section === undefined || section === "transactions") && (
          <div id="fees-section-transactions" className="scroll-mt-28">
            <FeeTransactionsList
              schoolId={schoolId}
              classes={classesList}
              onSuccess={reloadAfterMutation}
            />
          </div>
        )}

        {(section === undefined || section === "student-fee-records" || section === "fees-records") && (
          <div id="fees-section-student-fee-records" className="scroll-mt-28">
            {!sectionReady && (section === "fees-records" || section === "student-fee-records") ? (
              <SectionLoader />
            ) : (
              <FeeRecordsTable fees={recordsForTable} classes={classesList} />
            )}
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
      </div>
    </div>
  );
}
