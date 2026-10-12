import { analysisHasTables, type AnalysisSection } from "@/lib/school/loadSchoolAnalysis";
import type { AnalysisResponse, AnalysisTableSection } from "./types";

export function sectionNeedsTables(section: AnalysisSection): section is AnalysisTableSection {
  return (
    section === "gender-enrollment" ||
    section === "admission-comparison" ||
    section === "fee-collection"
  );
}

export function sectionHasTables(section: AnalysisSection, payload: AnalysisResponse | null | undefined): boolean {
  if (!sectionNeedsTables(section)) return true;
  if (section === "gender-enrollment") return Array.isArray(payload?.enrollmentByClassSection);
  if (section === "admission-comparison") return Array.isArray(payload?.admissionComparison);
  if (section === "fee-collection") return Array.isArray(payload?.feeCollectionByClass);
  return analysisHasTables(payload);
}
