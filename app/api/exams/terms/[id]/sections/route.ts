import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import { schoolIdViaTeacherClass, schoolIdViaTeacherRelation, schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    if (session.user.role === "TEACHER") {
      schoolId = await schoolIdViaTeacherClass(session.user.id);
      if (!schoolId) {
        schoolId = await schoolIdViaTeacherRelation(session.user.id);
      }
    }
    if (!schoolId) {
      schoolId = await schoolIdViaAdminRelation(session.user.id);
    }
  }
  return schoolId;
}

/** GET/PUT mark subsections for a specific exam term (per class). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (
      session.user.role !== "SCHOOLADMIN" &&
      session.user.role !== "TEACHER"
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { id } = await params;
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const term = await withTenantScopedClient(schoolId, (tx) =>
      tx.examTerm.findFirst({
        where: { id, schoolId },
        select: {
          id: true,
          name: true,
          sections: { orderBy: { order: "asc" } },
        },
      })
    );
    if (!term) {
      return NextResponse.json({ message: "Exam term not found" }, { status: 404 });
    }

    return NextResponse.json({ sections: term.sections, termId: term.id, termName: term.name });
  } catch (e: unknown) {
    logger.error("Term sections GET:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

/** Replace all sections for a term. Empty array = no subsections. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { id } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      select: { id: true, name: true },
    });
    if (!term) {
      return NextResponse.json({ message: "Exam term not found" }, { status: 404 });
    }

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const rawSections = Array.isArray(body.sections) ? body.sections : null;
    if (!rawSections) {
      return NextResponse.json(
        { message: "sections array is required" },
        { status: 400 }
      );
    }

    const parsed: Array<{ name: string; maxMarks: number; order: number }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < rawSections.length; i++) {
      const row = rawSections[i];
      const name =
        typeof row?.name === "string" ? row.name.trim() : "";
      const maxMarks = Number(row?.maxMarks);
      if (!name) {
        return NextResponse.json(
          { message: `Section ${i + 1}: name is required` },
          { status: 400 }
        );
      }
      if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        return NextResponse.json(
          { message: `Section "${name}": maxMarks must be a positive number` },
          { status: 400 }
        );
      }
      const key = name.toUpperCase();
      if (seen.has(key)) {
        return NextResponse.json(
          { message: `Duplicate section name: ${name}` },
          { status: 400 }
        );
      }
      seen.add(key);
      parsed.push({
        name,
        maxMarks,
        order: typeof row?.order === "number" ? row.order : i,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.examTermSection.deleteMany({ where: { termId: term.id } });
      if (parsed.length > 0) {
        await tx.examTermSection.createMany({
          data: parsed.map((s) => ({
            id: randomUUID(),
            termId: term.id,
            name: s.name,
            maxMarks: s.maxMarks,
            order: s.order,
            updatedAt: new Date(),
          })),
        });
      }
    });

    const sections = await prisma.examTermSection.findMany({
      where: { termId: term.id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ sections }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("Term sections PUT:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
