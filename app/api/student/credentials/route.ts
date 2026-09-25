import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  computeStudentCredentials,
  type StudentCredentialRow,
} from "@/lib/computeStudentCredentials";
import { isRedisEnabled } from "@/lib/redis";
import { tenantCacheKey, swrGet, swrSet } from "@/lib/tenantCache";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

async function assertAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  const isAdmin =
    session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return {
      error: NextResponse.json(
        { message: "Only admins can view student credentials" },
        { status: 403 }
      ),
    };
  }

  const schoolId = await resolveSchoolId(session);
  if (!schoolId) {
    return {
      error: NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      ),
    };
  }

  if (session.user.schoolIsActive === false) {
    return {
      error: NextResponse.json({ message: "School is paused" }, { status: 403 }),
    };
  }

  return { session, schoolId };
}

function toExportRows(rows: StudentCredentialRow[]) {
  return rows.map((r, i) => ({
    SNo: i + 1,
    Name: r.name,
    Email: r.email,
    Password: r.passwordVerified ? r.password : "",
    DOB: r.dob,
    "Login verified": r.passwordVerified ? "Yes" : "No — reset required",
    Class: r.className,
    Section: r.section,
    "Admission No": r.admissionNumber,
    "Roll / Timelly ID": r.rollNo,
    "Account active": r.accountActive ? "Yes" : "No",
  }));
}

async function loadCredentialsCached(
  schoolId: string,
  filters: { classId: string; className: string; section: string }
) {
  const memKey = `credentials:${schoolId}:${filters.classId}:${filters.className}:${filters.section}`;
  const memHit = getSchoolDashboardServerCached<Awaited<ReturnType<typeof computeStudentCredentials>>>(memKey);
  if (memHit) return memHit;

  const now = Date.now();
  const cacheParams = {
    classId: filters.classId || null,
    className: filters.className || null,
    section: filters.section || null,
  };

  if (isRedisEnabled()) {
    const redisKey = await tenantCacheKey(schoolId, "api", "student:credentials", cacheParams);
    const cached = await swrGet<Awaited<ReturnType<typeof computeStudentCredentials>>>(redisKey);
    if (cached && now < cached.freshUntil) {
      setSchoolDashboardServerCached(memKey, cached.value, cached.freshUntil - now);
      return cached.value;
    }
  }

  const payload = await computeStudentCredentials(schoolId, {
    classId: filters.classId || undefined,
    className: filters.className || undefined,
    section: filters.section || undefined,
  });

  setSchoolDashboardServerCached(memKey, payload, 120_000);

  if (isRedisEnabled()) {
    const redisKey = await tenantCacheKey(schoolId, "api", "student:credentials", cacheParams);
    await swrSet(
      redisKey,
      { value: payload, freshUntil: now + 120_000, staleUntil: now + 600_000 },
      600
    );
  }

  return payload;
}

export async function GET(req: Request) {
  try {
    const auth = await assertAdminSession();
    if ("error" in auth) return auth.error;
    const { schoolId } = auth;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() || "";
    const className = searchParams.get("className")?.trim() || "";
    const section = searchParams.get("section")?.trim() || "";
    const format = searchParams.get("format")?.trim().toLowerCase() || "json";
    const verifiedOnly = searchParams.get("verifiedOnly") === "1";

    const payload = await loadCredentialsCached(schoolId, { classId, className, section });

    let rows = payload.students;
    if (verifiedOnly) {
      rows = rows.filter((r) => r.passwordVerified && r.accountActive);
    }

    const verifiedCount = rows.filter((r) => r.passwordVerified).length;
    const mismatchCount = rows.filter((r) => r.accountActive && !r.passwordVerified).length;

    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(toExportRows(rows));
      XLSX.utils.book_append_sheet(wb, ws, "Credentials");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const body = new Uint8Array(buf);
      const suffix = className || section || classId ? "filtered" : "all";
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="student-credentials-${suffix}.xlsx"`,
        },
      });
    }

    if (format === "csv") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(toExportRows(rows));
      const csv = XLSX.utils.sheet_to_csv(ws);
      const suffix = className || section || classId ? "filtered" : "all";
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="student-credentials-${suffix}.csv"`,
        },
      });
    }

    return NextResponse.json(
      verifiedOnly
        ? { students: rows, total: rows.length, verifiedCount, mismatchCount }
        : payload,
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Student credentials error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Class not found") ? 404 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export type { StudentCredentialRow };
