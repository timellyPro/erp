"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";

import TimellyLoader from "../common/TimellyLoader";
import AnalysisSectionNav from "./AnalysisSectionNav";
import FeesComparisonPanel from "./analysis/fees-comparison/FeesComparisonPanel";
import StudentCredentialsPanel from "./analysis/student-credentials/StudentCredentialsPanel";
import {
  defaultAnalysisStartYear,
  fetchSchoolAnalysisFast,
  fetchSchoolAnalysisTables,
  peekSchoolAnalysis,
  peekSchoolAnalysisAny,
  type AnalysisSection,
} from "@/lib/school/loadSchoolAnalysis";
import {
  analysisCacheKey,
  setSchoolAnalysisCached,
} from "@/lib/school/schoolAnalysisClientCache";
export type { AnalysisSection };

import {
  type AnalysisDashboardProps,
  type AnalysisResponse,
  type GenderViewMode,
  sectionHasTables,
  sectionNeedsTables,
  buildAnalysisViewModel,
  AnalysisFilterHeader,
  AnalysisOverviewSection,
  GenderEnrollmentSection,
  AdmissionComparisonSection,
  FeeCollectionSection,
} from "./shared/analysis";

/* ---------------- Component ---------------- */

export default function AnalysisDashboard({ section = "overview" }: AnalysisDashboardProps) {
  const defaultYear = defaultAnalysisStartYear();
  const initialCached = peekSchoolAnalysisAny(defaultYear);
  const [data, setData] = useState<AnalysisResponse | null>(initialCached);
  const [shellLoading, setShellLoading] = useState(() => !initialCached?.stats);
  const [tablesLoading, setTablesLoading] = useState(
    () => sectionNeedsTables(section) && !sectionHasTables(section, initialCached)
  );
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number>(() => initialCached?.selectedYear ?? defaultYear);
  const [classId, setClassId] = useState("");
  const { data: session, status: sessionStatus } = useSession();
  const schoolId = session?.user?.schoolId ?? null;
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [genderViewMode, setGenderViewMode] = useState<GenderViewMode>("CLASS_WISE");
  const [enrollmentSearch, setEnrollmentSearch] = useState("");
  const [enrollmentGroupFilter, setEnrollmentGroupFilter] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [feeClassSectionFilter, setFeeClassSectionFilter] = useState("");

  useEffect(() => {
    if (section === "student-credentials" || section === "fees-comparison") return;
    if (sessionStatus !== "authenticated") return;

    const sid = schoolId;
    const cached =
      (sid ? peekSchoolAnalysis(sid, year, classId) : null) ??
      peekSchoolAnalysisAny(year, classId);

    let shellReady = Boolean(cached?.stats);
    if (cached) {
      setData(cached);
      setError(null);
      setShellLoading(false);
      setTablesLoading(sectionNeedsTables(section) && !sectionHasTables(section, cached));
    }

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    (async () => {
      try {
        if (sectionNeedsTables(section) && !sectionHasTables(section, cached)) {
          setTablesLoading(true);
          const tables = await fetchSchoolAnalysisTables(year, {
            schoolId: sid,
            classId,
            section,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
          setTablesLoading(false);
          setShellLoading(false);
          setError(null);

          if (!shellReady) {
            void fetchSchoolAnalysisFast(year, {
              schoolId: sid,
              classId,
            })
              .then((fast) => {
                if (controller.signal.aborted) return;
                setData((prev) => ({ ...(prev ?? {}), ...fast } as AnalysisResponse));
              })
              .catch(() => {});
          }
          return;
        }

        if (!shellReady) {
          const fast = await fetchSchoolAnalysisFast(year, {
            schoolId: sid,
            classId,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          shellReady = true;
          setData((prev) => ({ ...(prev ?? {}), ...fast } as AnalysisResponse));
          setShellLoading(false);
          setError(null);

          if (sectionNeedsTables(section) && !sectionHasTables(section, fast)) {
            setTablesLoading(true);
            const tables = await fetchSchoolAnalysisTables(year, {
              schoolId: sid,
              classId,
              section,
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
            setTablesLoading(false);
            return;
          }
        }

        if (!sectionHasTables(section, cached)) {
          void fetchSchoolAnalysisTables(year, {
            schoolId: sid,
            classId,
            section: sectionNeedsTables(section) ? section : undefined,
          })
            .then((tables) => {
              if (controller.signal.aborted) return;
              setData((prev) => ({ ...(prev ?? {}), ...tables } as AnalysisResponse));
              setTablesLoading(false);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Analysis fetch error:", err);
        if (!shellReady) {
          setError(err instanceof Error ? err.message : "Failed to load analysis");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setShellLoading(false);
      }
    })();

    return () => controller.abort();
  }, [sessionStatus, schoolId, year, classId, section]);

  useEffect(() => {
    if (!schoolId || !data) return;
    setSchoolAnalysisCached(analysisCacheKey(schoolId, year, classId), data);
  }, [schoolId, data, year, classId]);

  if (section === "fees-comparison") {
    return <FeesComparisonPanel />;
  }

  if (section === "student-credentials") {
    return (
      <div className="p-4 sm:p-6 text-white">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:mb-5 sm:rounded-2xl sm:p-5"
        >
          <div className="mb-2 border-b border-white/10 pb-2 sm:mb-4 sm:pb-4">
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Analysis
            </p>
            <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
              Share login details with students by class and section.
            </p>
          </div>
          <AnalysisSectionNav embedded />
        </motion.div>
        <StudentCredentialsPanel />
      </div>
    );
  }

  if ((sessionStatus === "loading" || shellLoading || (!error && !data)) && !data) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <TimellyLoader
          title="Loading analysis"
          steps={["School data", "Student strength", "Insights"]}
          compact
        />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <p className="text-red-400">{error ?? "No data available"}</p>
      </div>
    );
  }

  /* ---------------- UI ---------------- */

  const {
    selectedYear,
    availableYears,
    stats,
    axisStyle,
    feesData,
    enrollmentData,
    attendanceData,
    subjectData,
    topTeachers,
    admissionComparisonRows,
    admissionComparisonTotals,
    formatInr,
    enrollmentGroupOptions,
    feeClassSectionOptions,
    enrollmentRowsFiltered,
    feeRowsFiltered,
    enrollmentFilteredTotals,
    feeFilteredTotals,
    feeFilteredAvgDiscountPercent,
    feeFilteredCollectionPercent,
    feeFilteredDuePercent,
    exportGenderExcel,
    exportAdmissionComparisonExcel,
    exportPaymentDetailsExcel,
  } = buildAnalysisViewModel({
    data,
    year,
    classId,
    genderViewMode,
    enrollmentSearch,
    enrollmentGroupFilter,
    feeSearch,
    feeClassSectionFilter,
  });

  return (
    <div className="min-h-screen p-3 pb-6 text-white sm:p-4 md:p-5">
      <AnalysisFilterHeader
        classId={classId}
        onClassIdChange={setClassId}
        classes={data.classes ?? []}
        year={year}
        onYearChange={setYear}
        availableYears={availableYears}
      />

      {section === "overview" ? (
        <AnalysisOverviewSection
          shellLoading={shellLoading}
          stats={stats}
          axisStyle={axisStyle}
          feesData={feesData}
          enrollmentData={enrollmentData}
          attendanceData={attendanceData}
          subjectData={subjectData}
          topTeachers={topTeachers}
          selectedYear={selectedYear}
        />
      ) : null}

      {section === "gender-enrollment" ? (
        <GenderEnrollmentSection
          tablesLoading={tablesLoading}
          enrollmentSearch={enrollmentSearch}
          onEnrollmentSearchChange={setEnrollmentSearch}
          genderViewMode={genderViewMode}
          onGenderViewModeChange={setGenderViewMode}
          enrollmentGroupFilter={enrollmentGroupFilter}
          onEnrollmentGroupFilterChange={setEnrollmentGroupFilter}
          enrollmentGroupOptions={enrollmentGroupOptions}
          onExportClassWise={() => void exportGenderExcel("CLASS_WISE")}
          onExportSectionWise={() => void exportGenderExcel("SECTION_WISE")}
          enrollmentRowsFiltered={enrollmentRowsFiltered}
          enrollmentFilteredTotals={enrollmentFilteredTotals}
        />
      ) : null}

      {section === "admission-comparison" ? (
        <AdmissionComparisonSection
          tablesLoading={tablesLoading}
          onExport={() => void exportAdmissionComparisonExcel()}
          admissionComparisonRows={admissionComparisonRows}
          admissionComparisonTotals={admissionComparisonTotals}
        />
      ) : null}

      {section === "fee-collection" ? (
        <FeeCollectionSection
          tablesLoading={tablesLoading}
          feeSearch={feeSearch}
          onFeeSearchChange={setFeeSearch}
          feeClassSectionFilter={feeClassSectionFilter}
          onFeeClassSectionFilterChange={setFeeClassSectionFilter}
          feeClassSectionOptions={feeClassSectionOptions}
          onExport={() => void exportPaymentDetailsExcel()}
          feeRowsFiltered={feeRowsFiltered}
          formatInr={formatInr}
          feeFilteredTotals={feeFilteredTotals}
          feeFilteredAvgDiscountPercent={feeFilteredAvgDiscountPercent}
          feeFilteredCollectionPercent={feeFilteredCollectionPercent}
          feeFilteredDuePercent={feeFilteredDuePercent}
        />
      ) : null}
    </div>
  );
}
