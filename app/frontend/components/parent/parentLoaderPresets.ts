/** Per-tab copy for the Timelly loader on parent portal pages. */
export const PARENT_LOADER_PRESETS = {
  dashboard: {
    title: "Curating your home",
    steps: ["Attendance", "Homework", "Marks", "Updates"],
    ariaLabel: "Loading home dashboard",
  },
  analytics: {
    title: "Building your analytics",
    steps: ["Attendance", "Performance", "Homework", "Workshops"],
    ariaLabel: "Loading analytics",
  },
  profile: {
    title: "Loading your profile",
    steps: ["Student info", "Academics", "Certificates"],
    ariaLabel: "Loading profile",
  },
  homework: {
    title: "Fetching homework",
    steps: ["Assignments", "Submissions", "Due dates"],
    ariaLabel: "Loading homework",
  },
  attendance: {
    title: "Loading attendance",
    steps: ["Calendar", "Records", "Summary"],
    ariaLabel: "Loading attendance",
  },
  marks: {
    title: "Loading marks",
    steps: ["Subjects", "Grades", "Reports"],
    ariaLabel: "Loading marks",
  },
  exams: {
    title: "Loading exams & syllabus",
    steps: ["Terms", "Schedules", "Syllabus"],
    ariaLabel: "Loading exams and syllabus",
  },
  chat: {
    title: "Loading conversations",
    steps: ["Appointments", "Messages", "Teachers"],
    ariaLabel: "Loading chat",
  },
  workshops: {
    title: "Loading workshops",
    steps: ["Events", "Registrations", "Details"],
    ariaLabel: "Loading workshops",
  },
  certificates: {
    title: "Loading certificates",
    steps: ["Requests", "Approved", "Issued"],
    ariaLabel: "Loading certificates",
  },
  leave: {
    title: "Loading leave applications",
    steps: ["History", "Class teacher", "Status"],
    ariaLabel: "Loading leave applications",
  },
  subscription: {
    title: "Loading subscription",
    steps: ["Status", "Trial", "Payments"],
    ariaLabel: "Loading subscription",
  },
  fees: {
    title: "Loading fee details",
    steps: ["Fee summary", "Payments", "Receipts"],
    ariaLabel: "Loading fees",
  },
  settings: {
    title: "Loading settings",
    steps: ["Profile", "Security", "Preferences"],
    ariaLabel: "Loading settings",
  },
  shell: {
    title: "Opening parent portal",
    steps: ["Session", "Subscription", "Ready"],
    ariaLabel: "Loading parent portal",
  },
} as const;

export type ParentLoaderPresetKey = keyof typeof PARENT_LOADER_PRESETS;
