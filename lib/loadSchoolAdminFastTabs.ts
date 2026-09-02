import {
  invalidateSchoolAdminResource,
  loadSchoolAdminResource,
  peekSchoolAdminResource,
  setSchoolAdminResource,
} from "@/lib/schoolAdminFastTabCache";

export type SchoolAdminClassRow = {
  id: string;
  name: string;
  section: string;
  students: number;
  teacher: string;
  subject: string;
};

type ClassApiRow = {
  id: string;
  name?: string | null;
  section?: string | null;
  _count?: { students?: number } | null;
  teacher?: { name?: string | null; email?: string | null } | null;
};

export type ClassesPagePayload = {
  classRows: SchoolAdminClassRow[];
  totalClasses: number;
  totalStudents: number;
  totalTeachers: number;
  avgSize: number;
};

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONDITIONALLY_APPROVED";

export type SchoolAdminLeave = {
  id: string;
  teacher: { id: string; name: string; email: string };
  leaveType: string;
  fromDate: string;
  toDate: string;
  status: LeaveStatus;
  reason?: string | null;
  remarks?: string | null;
  approvedAt?: string | null;
  updatedAt?: string | null;
};

export type TeacherAuditTeacher = {
  id: string;
  name?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  teacherId?: string | null;
  subject?: string | null;
  performanceScore?: number;
  recordCount?: number;
};

export type TeacherAuditRecord = {
  id: string;
  category: string;
  customCategory?: string | null;
  description: string;
  scoreImpact: number;
  academicYear?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string | null };
};

export type EventItem = {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  location?: string | null;
  mode?: string | null;
  additionalInfo?: string | null;
  teacher?: { name?: string | null } | null;
  photo?: string | null;
  maxSeats?: number | null;
  _count?: { registrations: number };
  type?: string | null;
  level?: string | null;
  class?: { id: string; name: string; section?: string | null } | null;
  teacherId?: string | null;
  schoolId?: string | null;
};

export type NewsFeedItem = {
  id: string;
  title: string;
  description: string;
  photo: string | null;
  photos?: string[];
  likes: number;
  likedByMe: boolean;
  createdBy: { id: string; name: string | null; email: string | null; photoUrl?: string | null };
  createdAt: string;
};

type NewsFeedApiRow = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  photo?: unknown;
  mediaUrl?: unknown;
  photos?: unknown;
  likes?: unknown;
  likedByMe?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
};

export type CircularRow = {
  id: string;
  referenceNumber: string;
  date: string;
  subject: string;
  content: string;
  importanceLevel: string;
  recipients: string[];
  issuedBy: { id: string; name: string | null };
  publishStatus: string;
  attachments?: string[];
  classId: string | null;
  targetClass?: { id: string; name: string; section: string | null } | null;
};

export type CertificateRequestListItem = {
  id: string;
  certificateType: string | null;
  reason: string | null;
  status: string;
  issuedDate: string | null;
  tcDocumentUrl: string | null;
  createdAt: string;
  student: {
    id: string;
    user: { id: string; name: string | null; email: string | null };
    class: { id: string; name: string; section: string | null } | null;
  };
  requestedBy: { id: string; name: string | null; email: string | null } | null;
  approvedBy: { id: string; name: string | null; email: string | null } | null;
};

export type ExamsPagePayload = {
  terms: unknown[];
  classes: unknown[];
  examTypes: string[];
  subjects: string[];
};

export type UserMePayload = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    mobile: string | null;
    address: string | null;
    language: string | null;
    photoUrl: string | null;
  };
};

const ns = {
  classes: "classes",
  leaves: "teacher-leaves",
  auditTeachers: "teacher-audit-teachers",
  auditRecords: "teacher-audit-records",
  events: "events",
  eventDetails: "event-details",
  newsfeed: "newsfeed",
  circulars: "circulars",
  certificates: "certificates",
  exams: "exams",
  settingsUser: "settings-user",
} as const;

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || fallback);
  }
  return data as T;
}

export function peekClassesPage() {
  return peekSchoolAdminResource<ClassesPagePayload>(ns.classes);
}

export async function loadClassesPage(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<ClassesPagePayload>(
    ns.classes,
    "default",
    async () => {
      const [classesRes, studentsRes, teachersRes] = await Promise.all([
        fetch("/api/class/list", { method: "GET", credentials: "include", cache: "no-store", signal: options?.signal }),
        fetch("/api/student/list?take=1&includeTotal=1", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: options?.signal,
        }),
        fetch("/api/teacher/list", { method: "GET", credentials: "include", cache: "no-store", signal: options?.signal }),
      ]);
      const [classesData, studentsData, teachersData] = await Promise.all([
        jsonOrThrow<{ classes?: ClassApiRow[] }>(classesRes, "Failed to load classes."),
        studentsRes.ok ? studentsRes.json().catch(() => null) : Promise.resolve(null),
        teachersRes.ok ? teachersRes.json().catch(() => null) : Promise.resolve(null),
      ]);
      const rows = Array.isArray(classesData.classes) ? classesData.classes : [];
      const totalStudents =
        typeof studentsData?.total === "number"
          ? studentsData.total
          : Array.isArray(studentsData?.students)
            ? studentsData.students.length
            : 0;
      const totalTeachers = Array.isArray(teachersData?.teachers) ? teachersData.teachers.length : 0;
      const classRows = rows.map((row) => ({
        id: row.id,
        name: row.name ?? "Untitled",
        section: row.section ? `Section ${row.section}` : "-",
        students: row?._count?.students ?? 0,
        teacher: row?.teacher?.name ?? "Unassigned",
        subject: row?.teacher?.email ?? "",
      }));
      return {
        classRows,
        totalClasses: classRows.length,
        totalStudents,
        totalTeachers,
        avgSize: classRows.length > 0 ? Math.round(totalStudents / classRows.length) : 0,
      };
    },
    options
  );
}

export function setClassesPageCache(payload: ClassesPagePayload) {
  setSchoolAdminResource(ns.classes, "default", payload);
}

export function invalidateClassesPage() {
  invalidateSchoolAdminResource(ns.classes);
}

export function peekTeacherLeavesPage() {
  return peekSchoolAdminResource<{ pendingLeaves: SchoolAdminLeave[]; allLeaves: SchoolAdminLeave[] }>(ns.leaves);
}

export async function loadTeacherLeavesPage(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<{ pendingLeaves: SchoolAdminLeave[]; allLeaves: SchoolAdminLeave[] }>(
    ns.leaves,
    "default",
    async () => {
      const [pendingRes, allRes] = await Promise.all([
        fetch("/api/leaves/pending", { credentials: "include", cache: "no-store", signal: options?.signal }),
        fetch("/api/leaves/all", { credentials: "include", cache: "no-store", signal: options?.signal }),
      ]);
      const [pendingData, allData] = await Promise.all([
        pendingRes.json().catch(() => []),
        allRes.json().catch(() => []),
      ]);
      return {
        pendingLeaves: pendingRes.ok && Array.isArray(pendingData) ? pendingData : [],
        allLeaves: allRes.ok && Array.isArray(allData) ? allData : [],
      };
    },
    options
  );
}

export function setTeacherLeavesPageCache(payload: { pendingLeaves: SchoolAdminLeave[]; allLeaves: SchoolAdminLeave[] }) {
  setSchoolAdminResource(ns.leaves, "default", payload);
}

export function patchTeacherLeave(id: string, patch: Partial<SchoolAdminLeave>) {
  const current = peekTeacherLeavesPage();
  if (!current) return;
  const updatedAll = current.allLeaves.map((leave) => (leave.id === id ? { ...leave, ...patch } : leave));
  setTeacherLeavesPageCache({
    pendingLeaves: current.pendingLeaves.filter((leave) => leave.id !== id),
    allLeaves: updatedAll,
  });
}

function auditTeachersKey(q: string, academicYear: string) {
  return `${academicYear || "all"}:${q.trim().toLowerCase()}`;
}

export function peekTeacherAuditTeachers(q: string, academicYear: string) {
  return peekSchoolAdminResource<TeacherAuditTeacher[]>(ns.auditTeachers, auditTeachersKey(q, academicYear));
}

export async function loadTeacherAuditTeachers(
  q: string,
  academicYear: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
) {
  const key = auditTeachersKey(q, academicYear);
  return loadSchoolAdminResource<TeacherAuditTeacher[]>(
    ns.auditTeachers,
    key,
    async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (academicYear && academicYear !== "all") params.set("academicYear", academicYear);
      const res = await fetch(`/api/teacher-audit/teachers?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ teachers?: TeacherAuditTeacher[] }>(res, "Failed to load teachers");
      return Array.isArray(data.teachers) ? data.teachers : [];
    },
    options
  );
}

function auditRecordsKey(teacherId: string, academicYear: string) {
  return `${teacherId}:${academicYear || "all"}`;
}

export function peekTeacherAuditRecords(teacherId: string, academicYear: string) {
  return peekSchoolAdminResource<TeacherAuditRecord[]>(ns.auditRecords, auditRecordsKey(teacherId, academicYear));
}

export async function loadTeacherAuditRecords(
  teacherId: string,
  academicYear: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
) {
  const key = auditRecordsKey(teacherId, academicYear);
  return loadSchoolAdminResource<TeacherAuditRecord[]>(
    ns.auditRecords,
    key,
    async () => {
      const params = new URLSearchParams({ take: "50" });
      if (academicYear && academicYear !== "all") params.set("academicYear", academicYear);
      const res = await fetch(`/api/teacher-audit/${teacherId}/records?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ records?: TeacherAuditRecord[] }>(res, "Failed to load records");
      return Array.isArray(data.records) ? data.records : [];
    },
    options
  );
}

export function setTeacherAuditRecords(teacherId: string, academicYear: string, records: TeacherAuditRecord[]) {
  setSchoolAdminResource(ns.auditRecords, auditRecordsKey(teacherId, academicYear), records);
}

export function invalidateTeacherAuditTeachers() {
  invalidateSchoolAdminResource(ns.auditTeachers);
}

export function peekEventsPage() {
  return peekSchoolAdminResource<EventItem[]>(ns.events);
}

export async function loadEventsPage(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<EventItem[]>(
    ns.events,
    "default",
    async () => {
      const res = await fetch("/api/events/list", { credentials: "include", cache: "no-store", signal: options?.signal });
      const data = await jsonOrThrow<{ events?: EventItem[] }>(res, "Failed to load events");
      return Array.isArray(data.events) ? data.events : [];
    },
    options
  );
}

export function setEventsPageCache(events: EventItem[]) {
  setSchoolAdminResource(ns.events, "default", events);
}

export function peekEventDetails(id: string) {
  return peekSchoolAdminResource<EventItem>(ns.eventDetails, id);
}

export async function loadEventDetails(id: string, options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<EventItem>(
    ns.eventDetails,
    id,
    async () => {
      const res = await fetch(`/api/events/create/${id}`, { credentials: "include", cache: "no-store", signal: options?.signal });
      const data = await jsonOrThrow<{ event?: EventItem }>(res, "Failed to load event details");
      return data.event as EventItem;
    },
    options
  );
}

export function peekNewsFeeds() {
  return peekSchoolAdminResource<NewsFeedItem[]>(ns.newsfeed);
}

export async function loadNewsFeeds(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<NewsFeedItem[]>(
    ns.newsfeed,
    "default",
    async () => {
      const res = await fetch("/api/newsfeed/list", { credentials: "same-origin", cache: "no-store", signal: options?.signal });
      const data = await jsonOrThrow<{ newsFeeds?: NewsFeedApiRow[] }>(res, "Failed to load news feed");
      const list = Array.isArray(data.newsFeeds) ? data.newsFeeds : [];
      return list.map((f) => ({
        id: String(f.id ?? ""),
        title: String(f.title ?? ""),
        description: String(f.description ?? ""),
        photo: typeof f.photo === "string" ? f.photo : typeof f.mediaUrl === "string" ? f.mediaUrl : null,
        photos: Array.isArray(f.photos) ? f.photos : undefined,
        likes: typeof f.likes === "number" ? f.likes : 0,
        likedByMe: Boolean(f.likedByMe),
        createdBy:
          f.createdBy && typeof f.createdBy === "object"
            ? {
                id: String((f.createdBy as { id?: unknown }).id ?? ""),
                name: (f.createdBy as { name?: string | null }).name ?? null,
                email: (f.createdBy as { email?: string | null }).email ?? null,
                photoUrl: (f.createdBy as { photoUrl?: string | null }).photoUrl ?? null,
              }
            : { id: "", name: null, email: null },
        createdAt: typeof f.createdAt === "string" ? f.createdAt : new Date().toISOString(),
      }));
    },
    options
  );
}

export function setNewsFeedsCache(feeds: NewsFeedItem[]) {
  setSchoolAdminResource(ns.newsfeed, "default", feeds);
}

function circularsKey(recipient: string, classId: string) {
  return `${recipient || "all"}:${classId || "all"}`;
}

export function peekCirculars(recipient = "all", classId = "") {
  return peekSchoolAdminResource<CircularRow[]>(ns.circulars, circularsKey(recipient, classId));
}

export async function loadCirculars(recipient = "all", classId = "", options?: { revalidate?: boolean; signal?: AbortSignal }) {
  const key = circularsKey(recipient, classId);
  return loadSchoolAdminResource<CircularRow[]>(
    ns.circulars,
    key,
    async () => {
      const params = new URLSearchParams({ status: "all" });
      if (recipient && recipient !== "all") params.set("recipient", recipient);
      if (classId) params.set("classId", classId);
      const res = await fetch(`/api/circular/list?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      });
      const data = await jsonOrThrow<{ circulars?: CircularRow[] }>(res, "Failed to load circulars");
      return Array.isArray(data.circulars) ? data.circulars : [];
    },
    options
  );
}

export function invalidateCirculars() {
  invalidateSchoolAdminResource(ns.circulars);
}

export function peekCertificatesPage() {
  return peekSchoolAdminResource<CertificateRequestListItem[]>(ns.certificates);
}

export async function loadCertificatesPage(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<CertificateRequestListItem[]>(
    ns.certificates,
    "default",
    async () => {
      let res = await fetch("/api/tc/list", { credentials: "include", cache: "no-store", signal: options?.signal });
      if (res.status === 404) {
        res = await fetch("/api/certificates/requests/list", {
          credentials: "include",
          cache: "no-store",
          signal: options?.signal,
        });
      }
      const data = await jsonOrThrow<{ certificateRequests?: CertificateRequestListItem[]; tcs?: CertificateRequestListItem[] }>(
        res,
        "Failed to load certificate requests"
      );
      return data.certificateRequests ?? data.tcs ?? [];
    },
    options
  );
}

export function setCertificatesPageCache(requests: CertificateRequestListItem[]) {
  setSchoolAdminResource(ns.certificates, "default", requests);
}

export function patchCertificateRequest(id: string, patch: Partial<CertificateRequestListItem>) {
  const current = peekCertificatesPage();
  if (!current) return;
  setCertificatesPageCache(current.map((request) => (request.id === id ? { ...request, ...patch } : request)));
}

export function peekExamsPage() {
  return peekSchoolAdminResource<ExamsPagePayload>(ns.exams);
}

export async function loadExamsPage(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<ExamsPagePayload>(
    ns.exams,
    "default",
    async () => {
      const [termsRes, typesRes, subjectsRes] = await Promise.all([
        fetch("/api/exams/terms", { credentials: "include", cache: "no-store", signal: options?.signal }),
        fetch("/api/exam-types", { credentials: "include", cache: "no-store", signal: options?.signal }),
        fetch("/api/exam-subjects", { credentials: "include", cache: "no-store", signal: options?.signal }),
      ]);
      const [termsData, typesData, subjectsData] = await Promise.all([
        jsonOrThrow<{ terms?: unknown[]; classes?: unknown[] }>(termsRes, "Failed to load exams"),
        jsonOrThrow<{ examTypes?: string[] }>(typesRes, "Failed to load exam types"),
        jsonOrThrow<{ subjects?: string[] }>(subjectsRes, "Failed to load subjects"),
      ]);
      return {
        terms: Array.isArray(termsData.terms) ? termsData.terms : [],
        classes: Array.isArray(termsData.classes) ? termsData.classes : [],
        examTypes: Array.isArray(typesData.examTypes) ? typesData.examTypes : [],
        subjects: Array.isArray(subjectsData.subjects) ? subjectsData.subjects : [],
      };
    },
    options
  );
}

export function setExamsPageCache(payload: ExamsPagePayload) {
  setSchoolAdminResource(ns.exams, "default", payload);
}

export function invalidateExamsPage() {
  invalidateSchoolAdminResource(ns.exams);
}

export function peekSettingsUser() {
  return peekSchoolAdminResource<UserMePayload>(ns.settingsUser);
}

export async function loadSettingsUser(options?: { revalidate?: boolean; signal?: AbortSignal }) {
  return loadSchoolAdminResource<UserMePayload>(
    ns.settingsUser,
    "default",
    async () => {
      const res = await fetch("/api/user/me", { credentials: "include", cache: "no-store", signal: options?.signal });
      return jsonOrThrow<UserMePayload>(res, "Unable to load settings");
    },
    options
  );
}

export function setSettingsUserCache(payload: UserMePayload) {
  setSchoolAdminResource(ns.settingsUser, "default", payload);
}

export function warmSchoolAdminFastTabs(): void {
  void loadClassesPage().catch(() => {});
  void loadTeacherLeavesPage().catch(() => {});
  void loadEventsPage().catch(() => {});
  void loadNewsFeeds().catch(() => {});
  void loadCirculars().catch(() => {});
  void loadCertificatesPage().catch(() => {});
  void loadExamsPage().catch(() => {});
  void loadSettingsUser().catch(() => {});
}

export function warmSchoolAdminTab(tab: string): void {
  if (tab === "classes") void loadClassesPage().catch(() => {});
  if (tab === "teacher-leaves") void loadTeacherLeavesPage().catch(() => {});
  if (tab === "teacher-audit") void loadTeacherAuditTeachers("", "").catch(() => {});
  if (tab === "workshops") void loadEventsPage().catch(() => {});
  if (tab === "newsfeed") void loadNewsFeeds().catch(() => {});
  if (tab === "circulars") void loadCirculars().catch(() => {});
  if (tab === "certificates") void loadCertificatesPage().catch(() => {});
  if (tab === "exams") void loadExamsPage().catch(() => {});
  if (tab === "settings") void loadSettingsUser().catch(() => {});
}
