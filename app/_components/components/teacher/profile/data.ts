import { ClassHandlingItem, QuickStats, TeacherProfileData } from "./types";

/** Empty shell — never show dummy/demo teacher data. */
export const EMPTY_TEACHER_PROFILE: TeacherProfileData = {
  name: "",
  teacherId: "",
  subject: "",
  assignedClasses: "",
  qualification: "",
  experience: "",
  joiningDate: "",
  status: "Active",
  email: "",
  phone: "",
  address: "",
  avatarUrl: null,
};

export const EMPTY_CLASSES: ClassHandlingItem[] = [];

export const EMPTY_QUICK_STATS: QuickStats = {
  totalClasses: 0,
  totalStudents: 0,
  workshopsConducted: 0,
};

export const STATUS_OPTIONS = [
  { id: "Active", name: "Active" },
  { id: "Inactive", name: "Inactive" },
];
