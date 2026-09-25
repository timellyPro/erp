export type { StudentDetailsFastBundle as StudentDetailsBundle } from "@/lib/fetchStudentDetailsFast";
export {
  fetchStudentDetailsFast as loadStudentDetailsBundle,
  peekStudentDetailsFast as peekStudentDetailsBundle,
  invalidateStudentDetailsFast as invalidateStudentDetailsBundleCache,
  refreshStudentFeesAfterMutation,
  warmStudentDetailsBundle,
} from "@/lib/fetchStudentDetailsFast";
