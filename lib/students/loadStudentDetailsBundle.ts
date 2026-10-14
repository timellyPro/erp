export type { StudentDetailsFastBundle as StudentDetailsBundle } from "@/lib/students/fetchStudentDetailsFast";
export {
  fetchStudentDetailsFast as loadStudentDetailsBundle,
  peekStudentDetailsFast as peekStudentDetailsBundle,
  invalidateStudentDetailsFast as invalidateStudentDetailsBundleCache,
  refreshStudentFeesAfterMutation,
  warmStudentDetailsBundle,
} from "@/lib/students/fetchStudentDetailsFast";
