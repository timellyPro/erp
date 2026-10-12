export const PUBLISH_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;

export type PublishStatus = typeof PUBLISH_STATUS[keyof typeof PUBLISH_STATUS];

export const IMPORTANCE_LEVELS = [
  { label: "High", activeClass: "bg-red-500 text-white" },
  { label: "Medium", activeClass: "bg-orange-400 text-black" },
  { label: "Low", activeClass: "bg-blue-500 text-white" },
] as const;

export const CIRCULAR_RECIPIENTS = [
  { value: "all", label: "All" },
  { value: "students", label: "Students" },
  { value: "teachers", label: "Teachers" },
  { value: "parents", label: "Parents" },
  { value: "staff", label: "Staff" },
];

export const CIRCULAR_PRIMARY = "#7dd3fc";
export const CIRCULAR_DRAFT_YELLOW = "#facc15";
export const CIRCULAR_SELECTED_RECIPIENT = "#bae6fd";
export const CIRCULAR_IMPORTANCE_HIGH = "#f87171";
export const CIRCULAR_IMPORTANCE_MEDIUM = "#facc15";
export const CIRCULAR_IMPORTANCE_LOW = "#4ade80";

export type CircularFormState = {
  referenceNumber: string;
  date: string;
  subject: string;
  content: string;
  importanceLevel: "Low" | "Medium" | "High";
  recipients: string[];
  issuedBy: string;
  classId: string;
  publishStatus: PublishStatus;
  attachments: string[];
};
