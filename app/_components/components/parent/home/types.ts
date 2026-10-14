export type ParentCircular = {
  id: string;
  referenceNumber: string;
  subject: string;
  content: string;
  publishStatus: string;
  date: string;
  importanceLevel?: string | null;
  attachments?: string[];
  issuedBy?: { id: string; name: string | null } | null;
};

export type ParentEvent = {
  id: string;
  title: string;
  type?: string | null;
  eventDate?: string | null;
};

export type ParentFeed = {
  id: string;
  title: string;
  description: string;
  photo?: string | null;
  likes?: number;
  likedByMe?: boolean;
  createdAt: string;
  createdBy?: {
    name?: string | null;
    photoUrl?: string | null;
  } | null;
};

export type ParentHomeData = {
  studentName: string;
  attendancePct: number;
  presentDays: number;
  totalAttendanceDays: number;
  homeworkSubmitted: number;
  homeworkTotal: number;
  averageMarksPct: number;
  gradeLabel: string;
  feePendingAmount: number;
  circulars: ParentCircular[];
  events: ParentEvent[];
  feeds: ParentFeed[];
};
