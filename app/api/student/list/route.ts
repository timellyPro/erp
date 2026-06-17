import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { requireSchoolId } from "@/lib/tenant";
import { withRequestTiming } from "@/lib/requestTiming";
import { tenantCacheKey, swrGet, swrSet } from "@/lib/tenantCache";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";
import { activeStudentWhere, studentStatusFilter } from "@/lib/studentStatus";
import { resolveStudentDisplayClass } from "@/lib/resolveStudentDisplayClass";

/** Admission / roll tokens usually include digits; pure letter queries are treated as names. */
function studentSearchQueryLooksLikeAdmissionOrRoll(q: string): boolean {
  return /\d/.test(q);
}

/** Exact student row lookup by cuid (autocomplete paste). */
function studentSearchQueryLooksLikeCuid(q: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(q);
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const ctx = await requireSchoolId(session);
    if (!ctx.ok) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
    const schoolId = ctx.schoolId;

    if (session.user.schoolIsActive === false) {
      return NextResponse.json(
        { message: "School is paused" },
        { status: 403 }
      );
    }

    return await withRequestTiming(
      { route: "GET /api/student/list", schoolId, userId: session.user.id },
      async () => {
        const { searchParams } = new URL(req.url);
        const rollNo = searchParams.get("rollNo")?.trim();
        const admissionNumber = searchParams.get("admissionNumber")?.trim();
        const studentId = searchParams.get("studentId")?.trim();
        const q = searchParams.get("q")?.trim();

        const takeParam = searchParams.get("take");
        const takeRaw = takeParam ? Number(takeParam) : 50;
        // Default: paginated + fast. If UI truly needs "render all", allow a larger cap explicitly.
        // NOTE: fetching everything in one request will not hit the <150ms target at scale.
        const renderAll = searchParams.get("all") === "1";
        const bypassCache = searchParams.get("refresh") === "1";
        /** Autocomplete / quick lookup — minimal columns, no application join. */
        const searchMode = searchParams.get("search") === "1" || Boolean(studentId);
        const maxTake = renderAll ? 10000 : 100;
        const take = renderAll
          ? maxTake
          : Math.min(maxTake, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 50));
        const cursor = searchParams.get("cursor")?.trim() || null;
        const includeTotal = searchParams.get("includeTotal") === "1";
        const activeOnlyTotal = searchParams.get("activeOnly") !== "0";
        const statusFilter = studentStatusFilter(searchParams.get("status"));

        const classId = searchParams.get("classId")?.trim() || "";
        const className = searchParams.get("className")?.trim() || "";
        const section = searchParams.get("section")?.trim() || "";

        const where: {
          schoolId: string;
          id?: string;
          status?: string;
          classId?: string;
          class?: { schoolId: string; name: string; section?: string };
          rollNo?: string | { contains: string; mode: "insensitive" };
          admissionNumber?: string | { contains: string; mode: "insensitive" };
          OR?: Array<
            | { admissionNumber: { contains: string; mode: "insensitive" } }
            | { rollNo: { contains: string; mode: "insensitive" } }
            | { user: { name: { contains: string; mode: "insensitive" } } }
          >;
        } = { schoolId };

        if (statusFilter) where.status = statusFilter;
        if (studentId) where.id = studentId;
        if (classId) {
          where.classId = classId;
        } else if (className) {
          where.class = {
            schoolId,
            name: className,
            ...(section ? { section } : {}),
          };
        }

        if (rollNo) where.rollNo = { contains: rollNo, mode: "insensitive" };
        if (admissionNumber) where.admissionNumber = admissionNumber;
        if (q) {
          if (searchMode && studentSearchQueryLooksLikeCuid(q)) {
            where.id = q;
          } else if (searchMode && studentSearchQueryLooksLikeAdmissionOrRoll(q)) {
            // Partial admission / roll no. — skip user.name join on remote DB.
            where.OR = [
              { admissionNumber: { contains: q, mode: "insensitive" } },
              { rollNo: { contains: q, mode: "insensitive" } },
            ];
          } else {
            where.OR = [
              { admissionNumber: { contains: q, mode: "insensitive" } },
              { rollNo: { contains: q, mode: "insensitive" } },
              { user: { name: { contains: q, mode: "insensitive" } } },
            ];
          }
        }

        const memKey = `students:list:${schoolId}:${take}:${cursor ?? "0"}:${searchMode ? "s" : "f"}:${studentId ?? ""}:${q ?? ""}:${rollNo ?? ""}:${admissionNumber ?? ""}:${statusFilter ?? ""}:${classId}:${className}:${section}`;
        if (!renderAll && !bypassCache) {
          const memCached = getSchoolDashboardServerCached<{
            students: unknown[];
            items: unknown[];
            nextCursor: string | null;
          }>(memKey);
          if (memCached) {
            return NextResponse.json(memCached, { status: 200 });
          }
        }

        const listSelect = searchMode
          ? {
              id: true,
              schoolId: true,
              admissionNumber: true,
              fatherName: true,
              motherName: true,
              status: true,
              user: { select: { name: true } },
              application: {
                select: { firstName: true, middleName: true, lastName: true },
              },
              class: { select: { id: true, name: true, section: true } },
            }
          : {
              id: true,
              admissionNumber: true,
              rollNo: true,
              fatherName: true,
              motherName: true,
              phoneNo: true,
              residencyType: true,
              status: true,
              dob: true,
              gender: true,
              createdAt: true,
              user: { select: { id: true, name: true, email: true, photoUrl: true } },
              class: { select: { id: true, name: true, section: true } },
              application: {
                select: {
                  id: true,
                  createdAt: true,
                  admissionNo: true,
                  fedenaNo: true,
                  workflowStatus: true,
                  class: { select: { id: true, name: true, section: true } },
                },
              },
            };

        if (studentId) {
          const row = await prisma.student.findUnique({
            where: { id: studentId },
            select: listSelect,
          });
          if (!row || row.schoolId !== schoolId) {
            return NextResponse.json({ students: [], items: [], nextCursor: null }, { status: 200 });
          }
          const { schoolId: _schoolId, ...rest } = row;
          const resolvedClass = searchMode
            ? rest.class
            : resolveStudentDisplayClass(
                rest.class,
                (rest as { application?: { class?: typeof rest.class } }).application?.class ?? null
              );
          const item = { ...rest, class: resolvedClass };
          const payload = { students: [item], items: [item], nextCursor: null };
          if (!bypassCache) setSchoolDashboardServerCached(memKey, payload, 180_000);
          return NextResponse.json(payload, { status: 200 });
        }

        const students = await prisma.student.findMany({
          where,
          select: listSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        const hasNext = students.length > take;
        const rawItems = hasNext ? students.slice(0, take) : students;
        const items = rawItems.map((row) => {
          if (searchMode) {
            const { schoolId: _schoolId, ...rest } = row as typeof row & { schoolId?: string };
            return { ...rest, class: rest.class ?? null };
          }
          const appClass =
            (row as { application?: { class?: typeof row.class } }).application?.class ?? null;
          const resolvedClass = resolveStudentDisplayClass(row.class, appClass);
          const { application: _app, ...rest } = row as typeof row & {
            application?: unknown;
          };
          return { ...rest, class: resolvedClass };
        });
        const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

        // Backwards compatible payload: older UI expects `{ students }`.
        let total: number | undefined = undefined;
        if (includeTotal && !cursor) {
          const countWhere =
            statusFilter || !activeOnlyTotal
              ? where
              : { ...where, ...activeStudentWhere };
          const countKey = await tenantCacheKey(schoolId, "api", "students:count", { where: countWhere });
          const cached = await swrGet<{ total: number }>(countKey);
          const now = Date.now();
          if (cached && now < cached.freshUntil) {
            total = cached.value.total;
          } else {
            total = await prisma.student.count({ where: countWhere });
            await swrSet(
              countKey,
              { value: { total }, freshUntil: now + 10_000, staleUntil: now + 60_000 },
              60
            );
          }
        }

        const payload = { students: items, items, nextCursor, ...(total !== undefined ? { total } : {}) };
        if (!renderAll && !bypassCache) {
          setSchoolDashboardServerCached(memKey, payload, 180_000);
        }
        return NextResponse.json(payload, { status: 200 });
      }
    );
  } catch (error: unknown) {
    console.error("List students error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
