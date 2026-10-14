export * from "./GradeIndicator";
export * from "./ReportCardMarksTable";
export * from "./ReportCardStatCard";
export * from "./ReportCardStudentHeader";
export * from "./ReportCardStudentList";
export * from "./TeacherClassAndExamPicker";
export * from "./downloadMarksExcel";
export * from "./downloadMarksPdf";
export * from "./teacherDownloadReportsFetch";
export * from "./useMarksClassesMetadata";
export * from "./useMarksEntryColumns";
export * from "./useMarksEntryState";
export * from "./useMarksRowMutators";
export * from "./useMarksSaveAll";
export * from "./useReportCardState";
export * from "./useTeacherDownloadReportsState";

// reportCardTypes.ts, teacherDownloadReportsTypes.ts, types.ts and utils.ts
// each independently define their own local ClassOption/MarkRow/
// DEFAULT_EXAM_TYPES/mapLiteClasses (four different shapes, same names,
// scoped to their own file's concern) — a blind `export *` from all four
// would collide. None of those four names are used outside this folder, so
// they're intentionally left un-exported here; only each file's other,
// externally-relevant exports are re-exported explicitly.
export type { StudentRow, MarksEntryForm, StudentApi, MarkApi } from "./types";
export { uniqueSubjects } from "./utils";
export type { StudentOption, ReportCardData } from "./reportCardTypes";
export type { StudentReportData, StudentBasic } from "./teacherDownloadReportsTypes";
