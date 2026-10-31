import type { Prisma } from "@prisma/client";
import type prisma from "@/lib/db";

/** What the school admin filters by. Parents and students share one account, so they are one category. */
export type LoginAuditCategory = "TEACHER" | "PARENT_STUDENT" | "STAFF";

const CATEGORY_ROLES: Record<LoginAuditCategory, string[]> = {
  TEACHER: ["TEACHER"],
  PARENT_STUDENT: ["STUDENT"],
  STAFF: ["SCHOOLADMIN", "CHAIRMAN"],
};

export function categoryOfRole(role: string): LoginAuditCategory | null {
  for (const [category, roles] of Object.entries(CATEGORY_ROLES)) {
    if (roles.includes(role)) return category as LoginAuditCategory;
  }
  return null;
}

export type LoginAuditFilters = {
  category: LoginAuditCategory | null;
  /** YYYY-MM-DD, India time, inclusive. */
  from: string;
  to: string;
  q: string;
  classId: string | null;
  page: number;
  pageSize: number;
};

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DAYS = 7;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in India (schools are in IST), as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseLoginAuditFilters(params: URLSearchParams, now = new Date()): LoginAuditFilters | { error: string } {
  const rawCategory = params.get("category")?.trim() || "";
  let category: LoginAuditCategory | null = null;
  if (rawCategory && rawCategory !== "ALL") {
    if (!(rawCategory in CATEGORY_ROLES)) return { error: "Unknown category" };
    category = rawCategory as LoginAuditCategory;
  }

  const to = params.get("to")?.trim() || todayIst(now);
  const from = params.get("from")?.trim() || addDays(to, -(DEFAULT_DAYS - 1));
  if (!YMD.test(from) || !YMD.test(to)) return { error: "Dates must be YYYY-MM-DD" };
  if (from > to) return { error: "From date is after To date" };

  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(params.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  return {
    category,
    from,
    to,
    q: (params.get("q") || "").trim().slice(0, 100),
    classId: params.get("classId")?.trim() || null,
    page,
    pageSize,
  };
}

/** Short "Chrome on Android" style label from a user-agent string. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone / iPad"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /FxiOS|Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

export type LoginAuditEntry = {
  id: string;
  at: string;
  role: string;
  category: LoginAuditCategory | null;
  name: string;
  email: string | null;
  admissionNumber: string | null;
  className: string | null;
  fatherName: string | null;
  device: string;
  ipAddress: string | null;
};

export type LoginAuditSummary = Record<LoginAuditCategory, { logins: number; people: number }>;

export type LoginAuditPage = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  /** Counts for the date range only (category / search / class filters do not apply). */
  summary: LoginAuditSummary;
  classes: Array<{ id: string; name: string }>;
  entries: LoginAuditEntry[];
};

function classLabel(c: { name: string; section: string | null } | null | undefined): string | null {
  if (!c) return null;
  return c.section ? `${c.name} - ${c.section}` : c.name;
}

type Db = Pick<typeof prisma, "loginAuditLog" | "student" | "class">;

/**
 * One page of a school's sign-in history. Every query is filtered by schoolId; callers run it
 * inside runInTenantScope so RLS also enforces it.
 */
export async function loadLoginAudit(db: Db, schoolId: string, f: LoginAuditFilters): Promise<LoginAuditPage> {
  const createdAt = {
    gte: new Date(`${f.from}T00:00:00.000+05:30`),
    lte: new Date(`${f.to}T23:59:59.999+05:30`),
  };
  const rangeWhere: Prisma.LoginAuditLogWhereInput = { schoolId, createdAt };

  const where: Prisma.LoginAuditLogWhereInput = { ...rangeWhere };
  if (f.category) where.role = { in: CATEGORY_ROLES[f.category] };
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { email: { contains: f.q, mode: "insensitive" } },
    ];
  }
  if (f.classId) {
    const inClass = await db.student.findMany({ where: { schoolId, classId: f.classId }, select: { id: true } });
    where.studentId = { in: inClass.map((s) => s.id) };
  }

  const [total, rows, perUser, classes] = await Promise.all([
    db.loginAuditLog.count({ where }),
    db.loginAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        createdAt: true,
        role: true,
        name: true,
        email: true,
        studentId: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    db.loginAuditLog.groupBy({ by: ["role", "userId"], where: rangeWhere, _count: { _all: true } }),
    db.class.findMany({ where: { schoolId }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }] }),
  ]);

  const summary: LoginAuditSummary = {
    TEACHER: { logins: 0, people: 0 },
    PARENT_STUDENT: { logins: 0, people: 0 },
    STAFF: { logins: 0, people: 0 },
  };
  for (const g of perUser) {
    const category = categoryOfRole(g.role);
    if (!category) continue;
    summary[category].logins += g._count._all;
    summary[category].people += 1;
  }

  const studentIds = [...new Set(rows.map((r) => r.studentId).filter((id): id is string => !!id))];
  const students = studentIds.length
    ? await db.student.findMany({
        where: { schoolId, id: { in: studentIds } },
        select: { id: true, admissionNumber: true, fatherName: true, class: { select: { name: true, section: true } } },
      })
    : [];
  const studentById = new Map(students.map((s) => [s.id, s]));

  return {
    from: f.from,
    to: f.to,
    page: f.page,
    pageSize: f.pageSize,
    total,
    summary,
    classes: classes.map((c) => ({ id: c.id, name: classLabel(c) ?? c.name })),
    entries: rows.map((r) => {
      const st = r.studentId ? studentById.get(r.studentId) : undefined;
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        role: r.role,
        category: categoryOfRole(r.role),
        name: r.name?.trim() || r.email || "Unknown",
        email: r.email,
        admissionNumber: st?.admissionNumber ?? null,
        className: classLabel(st?.class),
        fatherName: st?.fatherName ?? null,
        device: describeDevice(r.userAgent),
        ipAddress: r.ipAddress,
      };
    }),
  };
}
