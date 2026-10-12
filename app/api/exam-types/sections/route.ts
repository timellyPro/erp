import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import { schoolIdViaAdminRelation, schoolIdViaTeacherClass, schoolIdViaTeacherRelation } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;
  if (schoolId) return schoolId;
  if (session.user.role === "TEACHER") {
    schoolId =
      (await schoolIdViaTeacherClass(session.user.id)) ??
      (await schoolIdViaTeacherRelation(session.user.id));
  }
  return schoolId ?? (await schoolIdViaAdminRelation(session.user.id));
}

/** Replace subsections for an exam type. Empty array = single score (no subsections). */
export async function PUT(req: Request) {
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

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const name =
      typeof body.name === "string" ? body.name.trim().toUpperCase() : "";
    if (!name) {
      return NextResponse.json(
        { message: "Exam type name is required" },
        { status: 400 }
      );
    }

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
      const secName = typeof row?.name === "string" ? row.name.trim() : "";
      const maxMarks = Number(row?.maxMarks);
      if (!secName) {
        return NextResponse.json(
          { message: `Section ${i + 1}: name is required` },
          { status: 400 }
        );
      }
      if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        return NextResponse.json(
          { message: `Section "${secName}": maxMarks must be a positive number` },
          { status: 400 }
        );
      }
      const key = secName.toUpperCase();
      if (seen.has(key)) {
        return NextResponse.json(
          { message: `Duplicate section name: ${secName}` },
          { status: 400 }
        );
      }
      seen.add(key);
      parsed.push({
        name: secName,
        maxMarks,
        order: typeof row?.order === "number" ? row.order : i,
      });
    }

    const sectionSum = parsed.reduce((a, s) => a + s.maxMarks, 0);

    let examType = await prisma.examType.findFirst({
      where: { schoolId, name },
      select: { id: true, maxMarks: true },
    });

    if (!examType) {
      examType = await prisma.examType.create({
        data: {
          id: randomUUID(),
          name,
          schoolId,
          maxMarks: parsed.length > 0 ? sectionSum : null,
        },
        select: { id: true, maxMarks: true },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.examTypeSection.deleteMany({ where: { examTypeId: examType!.id } });
      if (parsed.length > 0) {
        const now = new Date();
        await tx.examTypeSection.createMany({
          data: parsed.map((s) => ({
            id: randomUUID(),
            examTypeId: examType!.id,
            name: s.name,
            maxMarks: s.maxMarks,
            order: s.order,
            updatedAt: now,
          })),
        });
        // Keep exam type maxMarks in sync with subsection sum
        await tx.examType.update({
          where: { id: examType!.id },
          data: { maxMarks: sectionSum },
        });
      }
    });

    const updated = await prisma.examType.findUniqueOrThrow({
      where: { id: examType.id },
      select: {
        id: true,
        name: true,
        maxMarks: true,
        sections: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, maxMarks: true, order: true },
        },
      },
    });

    return NextResponse.json({ examType: updated }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("Exam type sections PUT:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
