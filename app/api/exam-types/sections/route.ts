import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { randomUUID } from "crypto";

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const school = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = school?.id ?? null;
  }
  return schoolId;
}

/** Replace subsections for an exam type. Empty array = single score (no subsections). */
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
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
  } catch (e: unknown) {
    console.error("Exam type sections PUT:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
