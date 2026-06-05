import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  buildStudentDetailsCoreBundle,
  buildStudentDetailsShellPayload,
  buildStudentDetailsTabExtras,
  buildStudentDetailsTabPayload,
} from "@/lib/buildStudentDetailsTabPayload";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;
  if (!schoolId && (session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN")) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

const BREAKDOWN_TIMEOUT_MS = 12_000;

const shellCache = new Map<string, { freshUntil: number; value: Record<string, unknown> }>();
const SHELL_CACHE_TTL_MS = 300_000;

async function loadFeeBreakdownSafe(schoolId: string, studentId: string) {
  try {
    return await Promise.race([
      computeAdminStudentFeeBreakdown(schoolId, studentId, {
        migrateLumps: false,
        cleanupHostelMessDuplicates: false,
        reconcileTotals: false,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), BREAKDOWN_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/** Student details tab API — shell (fast), extras (deferred), or full bundle. */
export async function GET(req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;
  const url = new URL(req.url);
  const shellOnly = url.searchParams.get("shell") === "1";
  const extrasOnly = url.searchParams.get("extras") === "1";
  const coreOnly = url.searchParams.get("core") === "1";
  const profileOnly = url.searchParams.get("profileOnly") === "1";
  const fast = url.searchParams.get("fast") === "1";

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature =
    session.user.role === "TEACHER" &&
    (session.user.allowedFeatures?.includes("STUDENTS") ||
      session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  const isOwnStudent = session.user.studentId === id;

  if (!isAdmin && !isOwnStudent && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveSchoolId(session);
    const resolvedSchoolId = schoolId ?? null;

    if (extrasOnly) {
      const extras = await buildStudentDetailsTabExtras(id);
      return NextResponse.json(extras, { status: 200 });
    }

    if (coreOnly) {
      const core = await buildStudentDetailsCoreBundle(id, resolvedSchoolId);
      if (!core) {
        return NextResponse.json({ message: "Student not found" }, { status: 404 });
      }
      return NextResponse.json({ ...core.shell, feeBreakdown: core.feeBreakdown }, { status: 200 });
    }

    const withBreakdown = url.searchParams.get("breakdown") === "1";

    if (shellOnly || (fast && !profileOnly)) {
      if (shellOnly && !withBreakdown) {
        const shellKey = `${resolvedSchoolId ?? "own"}:${id}:shell`;
        const shellHit = shellCache.get(shellKey);
        if (shellHit && Date.now() < shellHit.freshUntil) {
          return NextResponse.json({ ...shellHit.value, feeBreakdown: null }, { status: 200 });
        }
        const shell = await buildStudentDetailsShellPayload(id, resolvedSchoolId);
        if (!shell) {
          return NextResponse.json({ message: "Student not found" }, { status: 404 });
        }
        shellCache.set(shellKey, {
          value: shell as unknown as Record<string, unknown>,
          freshUntil: Date.now() + SHELL_CACHE_TTL_MS,
        });
        return NextResponse.json({ ...shell, feeBreakdown: null }, { status: 200 });
      }

      if (shellOnly && withBreakdown && resolvedSchoolId) {
        const [shell, feeBreakdown] = await Promise.all([
          buildStudentDetailsShellPayload(id, resolvedSchoolId),
          loadFeeBreakdownSafe(resolvedSchoolId, id),
        ]);
        if (!shell) {
          return NextResponse.json({ message: "Student not found" }, { status: 404 });
        }
        return NextResponse.json({ ...shell, feeBreakdown }, { status: 200 });
      }

      const shell = await buildStudentDetailsShellPayload(id, resolvedSchoolId);
      if (!shell) {
        return NextResponse.json({ message: "Student not found" }, { status: 404 });
      }
      if (shellOnly) {
        return NextResponse.json({ ...shell, feeBreakdown: null }, { status: 200 });
      }
      const feeBreakdown = resolvedSchoolId
        ? await loadFeeBreakdownSafe(resolvedSchoolId, id)
        : null;
      return NextResponse.json({ ...shell, feeBreakdown }, { status: 200 });
    }

    const detail = await buildStudentDetailsTabPayload(id, resolvedSchoolId);
    if (!detail) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    if (profileOnly) {
      return NextResponse.json({ ...detail, feeBreakdown: null }, { status: 200 });
    }

    const feeBreakdown = resolvedSchoolId
      ? await loadFeeBreakdownSafe(resolvedSchoolId, id)
      : null;

    return NextResponse.json({ ...detail, feeBreakdown }, { status: 200 });
  } catch (error: unknown) {
    console.error("Student details bundle error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
