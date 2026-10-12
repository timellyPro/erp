import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This codebase uses pragmatic typing (esp. API route filters/parsers).
    // Keep lint useful by not blocking builds on `any` in server routes.
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "off",
    },
  },
  {
    // UI components occasionally use `any` for generic table renderers, etc.
    files: [
      "app/_components/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "app/{chairman,schooladmin,superadmin,teacher,parent,screen,events,payment-success}/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Tests sometimes use CommonJS require() for simple mocks.
    files: ["**/*.{test,spec}.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Scripts are typically CommonJS.
    files: ["scripts/**/*.{js,ts}", "socket-server/**/*.{ts,js}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Allow setting initial state from URL params without lint noise.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "off",
      "react/no-children-prop": "off",
    },
  },
  {
    // Allow unused vars prefixed with "_" (common in route handlers).
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Keep UI files decomposed into components/modules of ~400 lines or
    // less. Warn (not error) so an occasional justified exception — a
    // single cohesive drawing routine, a large but flat options table —
    // doesn't block a build; CI treats repeated/large overruns as a signal
    // to split the file, not a hard wall.
    files: ["app/_components/**/*.{ts,tsx}"],
    ignores: ["**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "max-lines": [
        "warn",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Feature folders under a `shared/<feature>/` directory expose their
    // public API through an `index.ts` barrel (the main component(s) plus
    // their prop types). Consumers outside the folder must import that
    // barrel, not reach into an internal file directly — that keeps the
    // folder an actual module with a contract instead of a bag of files
    // anything can dig into. Files inside `shared/**` are exempt so
    // siblings within (or across) a feature folder can still import each
    // other freely.
    files: ["app/_components/components/**/*.{ts,tsx}"],
    ignores: ["**/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/shared/app-header/*",
                "**/shared/portal-settings/*",
                "**/shared/fee-structure/*",
                "**/shared/fee-transactions-list/*",
                "**/shared/hostel-mess/*",
                "**/shared/offline-payment/*",
                "**/shared/petty-cash/*",
                "**/shared/student-fees-payment/*",
                "**/shared/studentDetail/*",
                "**/shared/analysis/*",
                "**/shared/classes/*",
                "**/shared/teacher-leaves/*",
                "**/shared/teachersTab/*",
                "**/shared/timetable/*",
                "**/shared/workshops-and-events/*",
                "**/shared/event-details/*",
                "**/shared/add-school/*",
                "**/shared/schools/*",
                "**/shared/subscriptions/*",
              ],
              message:
                "Import from the feature's shared/<feature> barrel (its index.ts) instead of reaching into an internal file directly.",
            },
          ],
        },
      ],
    },
  },
  {
    // Same contract as the block above, for the plain `shared/` folders
    // (one level, not nested under `shared/<feature>/`) that got their own
    // index.ts barrels in this pass — chairman, parent/*, most of
    // schooladmin/*, settings, and teacher/* (excluding teacher/marks/shared,
    // which still has an internal re-export naming collision and has not
    // been barreled yet). Patterns are exact file basenames rather than a
    // blanket `**/shared/*` so a legitimate `from "./shared"` barrel import
    // (matching a subfolder name in the other rule block) is never caught
    // here by accident. "types" and "utils" are deliberately left off this
    // list: those two basenames also exist, unbarreled, in
    // teacher/marks/shared, and blocking them here would wrongly flag that
    // folder's still-legitimate deep imports.
    files: ["app/_components/components/**/*.{ts,tsx}"],
    ignores: ["**/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/shared/AcademicPerformanceChart",
                "**/shared/AccessControlPanel",
                "**/shared/AdmissionFeeAssignDialog",
                "**/shared/AdmissionFormView",
                "**/shared/AdmissionListView",
                "**/shared/AdmissionPaymentDialog",
                "**/shared/AppointTeacherMobileList",
                "**/shared/AppointTeacherTable",
                "**/shared/ApproveCertificateModal",
                "**/shared/AttendanceCalendarSection",
                "**/shared/AttendanceMobileList",
                "**/shared/AttendanceStatCards",
                "**/shared/AttendanceStatCardsSection",
                "**/shared/CertificateRequestsSection",
                "**/shared/CertificatesMobileCards",
                "**/shared/CertificatesTableLg",
                "**/shared/CertificatesTableMd",
                "**/shared/DashboardNewsSection",
                "**/shared/DashboardStatsHeader",
                "**/shared/DeleteAdmissionDialog",
                "**/shared/DiscountApprovalCard",
                "**/shared/DiscountApprovalsSearchHeader",
                "**/shared/DueHeadsSection",
                "**/shared/EditBaseFeeHeadDialog",
                "**/shared/EditParentModal",
                "**/shared/EditPaymentDialog",
                "**/shared/EditStudentModal",
                "**/shared/EventBasicDetailsFields",
                "**/shared/EventScheduleMediaFields",
                "**/shared/ExamDetailsFormFields",
                "**/shared/ExamTypesManager",
                "**/shared/FeeHeadCardsGrid",
                "**/shared/FeePaymentProgressSection",
                "**/shared/FeeReceiptPrintLayout",
                "**/shared/FeeRecordsRows",
                "**/shared/FeeSummaryCards",
                "**/shared/FeeSummarySection",
                "**/shared/FeesComparisonTable",
                "**/shared/LeaveApplicationForm",
                "**/shared/LeaveHistorySection",
                "**/shared/NamePositionStylePanel",
                "**/shared/PaymentHistorySection",
                "**/shared/PresentationalBits",
                "**/shared/ProfileStatCards",
                "**/shared/RecordHeadPaymentDialog",
                "**/shared/RequestCertificateModal",
                "**/shared/SchoolAdminAccountCard",
                "**/shared/SchoolAdminNotificationsCard",
                "**/shared/SchoolAdminPasswordCard",
                "**/shared/SchoolEmailDomainCard",
                "**/shared/SchoolHyperPGCredentialsCard",
                "**/shared/SelectedDaySection",
                "**/shared/StudentAssignPanel",
                "**/shared/StudentDetailsSection",
                "**/shared/StudentFeesPaymentModal",
                "**/shared/StudentNameCard",
                "**/shared/StudentSearchFilterBar",
                "**/shared/StudentSelectionPanel",
                "**/shared/SubjectsManager",
                "**/shared/SyllabusUnitsPanel",
                "**/shared/TeacherDetailsFields",
                "**/shared/WorkshopAndCertificatePanel",
                "**/shared/WorkshopEventsList",
                "**/shared/WorkshopStatTiles",
                "**/shared/admissionFeeReportExcel",
                "**/shared/admissionFeeReportPdf",
                "**/shared/admissionFeeReportPdfHelpers",
                "**/shared/admissionFeeReportTypes",
                "**/shared/appointTeacherTypes",
                "**/shared/attendanceHelpers",
                "**/shared/certificatesTabHelpers",
                "**/shared/circularFormConstants",
                "**/shared/classesPreload",
                "**/shared/constants",
                "**/shared/createEventFormOptions",
                "**/shared/createHubTypes",
                "**/shared/defaults",
                "**/shared/discountApprovalsCache",
                "**/shared/examsCacheReducer",
                "**/shared/feeReceiptBuilder",
                "**/shared/feeRecordsPdfExport",
                "**/shared/feeRecordsReportPeriod",
                "**/shared/feeRecordsSheetHelpers",
                "**/shared/feeRecordsTableTypes",
                "**/shared/feeTransactionsHelpers",
                "**/shared/feeTransactionsTypes",
                "**/shared/feesBreakdownHelpers",
                "**/shared/feesComparisonExcelExport",
                "**/shared/feesComparisonPdfExport",
                "**/shared/feesComparisonTypes",
                "**/shared/formatTimeAgo",
                "**/shared/hookTypes",
                "**/shared/parentCertificatesHelpers",
                "**/shared/parentFeesHelpers",
                "**/shared/parentProfileTypes",
                "**/shared/profileSidebarHelpers",
                "**/shared/studentDetailHelpers",
                "**/shared/teacherLeaveHelpers",
                "**/shared/useAdmissionFeeAssign",
                "**/shared/useAdmissionFormEditLoad",
                "**/shared/useAdmissionListState",
                "**/shared/useAdmissionPaymentDialog",
                "**/shared/useAdmissionReceiptPrinting",
                "**/shared/useAdmissionTabState",
                "**/shared/useAdmissionTableColumns",
                "**/shared/useAppointTeacherState",
                "**/shared/useAssignSectionState",
                "**/shared/useAttendanceColumns",
                "**/shared/useAttendanceState",
                "**/shared/useBaseFeeHeadEditing",
                "**/shared/useCertificatesTabState",
                "**/shared/useCircularFormState",
                "**/shared/useCreateEventFormState",
                "**/shared/useCreateHubState",
                "**/shared/useDiscountApprovalsState",
                "**/shared/useExamTypeActions",
                "**/shared/useExamsTabState",
                "**/shared/useExtraFeeHeadActions",
                "**/shared/useFeeRecordsExportActions",
                "**/shared/useFeeTransactionsEditDelete",
                "**/shared/useFeeTransactionsReceiptPrinting",
                "**/shared/useFeeTransactionsState",
                "**/shared/useFeesBreakdownState",
                "**/shared/useFeesComparisonState",
                "**/shared/useHeadPayment",
                "**/shared/useParentAttendanceState",
                "**/shared/useParentCertificatesState",
                "**/shared/useParentFeesState",
                "**/shared/useParentProfileState",
                "**/shared/useProfileSidebarState",
                "**/shared/useScheduleExamState",
                "**/shared/useSchoolBrand",
                "**/shared/useSchoolDashboardState",
                "**/shared/useStudentClassesBootstrap",
                "**/shared/useStudentDetailBundleLoading",
                "**/shared/useStudentDetailsPageState",
                "**/shared/useStudentEditDelete",
                "**/shared/useStudentExport",
                "**/shared/useStudentFeeMutations",
                "**/shared/useStudentFormAdd",
                "**/shared/useStudentListBootstrap",
                "**/shared/useStudentListFetching",
                "**/shared/useStudentSidebarPatch",
                "**/shared/useSubjectActions",
                "**/shared/useTeacherLeaveState",
                "**/shared/useTeacherWorkshopsState",
                "**/shared/useUserFormState",
                "**/shared/userFormHelpers",
                "**/shared/userFormTypes",
                "**/shared/validation",
                "**/shared/GradeIndicator",
                "**/shared/ReportCardMarksTable",
                "**/shared/ReportCardStatCard",
                "**/shared/ReportCardStudentHeader",
                "**/shared/ReportCardStudentList",
                "**/shared/TeacherClassAndExamPicker",
                "**/shared/downloadMarksExcel",
                "**/shared/downloadMarksPdf",
                "**/shared/reportCardTypes",
                "**/shared/teacherDownloadReportsFetch",
                "**/shared/teacherDownloadReportsTypes",
                "**/shared/useMarksClassesMetadata",
                "**/shared/useMarksEntryColumns",
                "**/shared/useMarksEntryState",
                "**/shared/useMarksRowMutators",
                "**/shared/useMarksSaveAll",
                "**/shared/useReportCardState",
                "**/shared/useTeacherDownloadReportsState",
                // Safe to add now that every shared/ folder with a "types"
                // or "utils" file (exams, profile, admission, marks) has
                // its own index.ts barrel.
                "**/shared/types",
                "**/shared/utils",
              ],
              message:
                "Import from the feature's shared/ barrel (its index.ts) instead of reaching into an internal file directly.",
            },
          ],
        },
      ],
    },
  },
  {
    // Plain <img> is intentional here. Avatars, certificates and receipts come
    // from arbitrary storage origins, blob:/data: previews and html2canvas/PDF
    // rendering, where next/image (which needs a fixed host allow-list and
    // width/height) adds breakage risk and no real optimisation.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
