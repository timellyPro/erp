/**
 * Central list of feature keys for granular access control.
 * When creating a Teacher (or School Admin), toggles map to these keys.
 */

export const FEATURES = [
  { id: "dashboard", label: "Dashboard", description: "Overview and analytics" },
  { id: "admission", label: "Admission", description: "Student admission applications" },
  { id: "marks-entry", label: "Marks Entry", description: "Enter and manage student marks" },
  { id: "marks-view", label: "Marks View", description: "View marks and reports" },
  { id: "attendance-mark", label: "Attendance Mark", description: "Mark daily attendance" },
  { id: "attendance-view", label: "Attendance View", description: "View attendance records" },
  { id: "certificates", label: "Certificates", description: "Issue and manage certificates" },
  { id: "events", label: "Events", description: "Workshops and events" },
  { id: "exams", label: "Exams & Syllabus", description: "Exams and syllabus tracking" },
  { id: "homework", label: "Homework", description: "Create and manage homework" },
  { id: "timetable", label: "Timetable", description: "View and manage class timetable" },
  { id: "newsfeed", label: "News Feed", description: "School news and updates" },
  { id: "communication", label: "Communication", description: "Appointments and messages" },
  { id: "leaves", label: "Leaves Management", description: "Apply and view leave requests" },
  { id: "student-leaves", label: "Student Leave Approval", description: "Approve or reject student leave requests" },
  { id: "classes", label: "Classes", description: "Manage class sections" },
  { id: "students", label: "Students", description: "Student directory" },
  { id: "teachers", label: "Teachers", description: "Teachers list" },
  { id: "school", label: "School Details", description: "School information" },
  { id: "payments", label: "Payments & Fees", description: "Fees and payments" },
  { id: "tc", label: "Transfer Certificate", description: "TC requests and approval" },
  { id: "student-details", label: "Student Details", description: "View student details" },
  { id: "teacher-leaves", label: "Teacher Leaves", description: "Manage teacher leaves" },
  { id: "teacher-audit", label: "Teacher Audit", description: "Audit teacher performance" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

export const FEATURE_IDS = FEATURES.map((f) => f.id);

/** Default features for a new teacher when none selected (empty = use role default in UI) */
export function getDefaultFeaturesForRole(role: "TEACHER" | "SCHOOLADMIN"): FeatureId[] {
  if (role === "SCHOOLADMIN") return [...FEATURE_IDS];
  return [
    "dashboard",
    "admission",
    "marks-entry",
    "marks-view",
    "attendance-mark",
    "attendance-view",
    "homework",
    "timetable",
    "newsfeed",
    "events",
    "exams",
    "communication",
    "leaves",
    "student-leaves",
    "classes",
    "students",
    "teachers",
    "tc",
  ];
}
