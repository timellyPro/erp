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
    if (session.user.role === "TEACHER") {
      const teacherClass = await prisma.class.findFirst({
        where: { teacherId: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherClass?.schoolId ?? null;
      if (!schoolId) {
        const teacherSchool = await prisma.school.findFirst({
          where: { teachers: { some: { id: session.user.id } } },
          select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
      }
    }
    if (!schoolId) {
      const school = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = school?.id ?? null;
    }
  }
  return schoolId;
}

const subjectSelect = {
  id: true,
  subject: true,
  maxMarks: true,
  sections: {
    orderBy: { order: "asc" as const },
    select: { id: true, name: true, maxMarks: true, order: true },
  },
};

/**
 * Add max marks / subsections for one exam type + subject.
 * Existing ExamType and ExamTypeSection rows are not written.
 * If this subject already has settings, they are returned unchanged.
 */
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

    const body = await req.json();
    const examTypeName =
      typeof body.examType === "string" ? body.examType.trim().toUpperCase() : "";
    const subject =
      typeof body.subject === "string" ? body.subject.trim().toUpperCase() : "";
    if (!examTypeName || !subject) {
      return NextResponse.json(
        { message: "Exam type and subject are required" },
        { status: 400 }
      );
    }

    const rawSections = Array.isArray(body.sections) ? body.sections : [];
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
          { message: `Section "${secName}": max marks must be a positive number` },
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

    let maxMarks: number | null = null;
    if (parsed.length > 0) {
      maxMarks = parsed.reduce((a, s) => a + s.maxMarks, 0);
    } else if (body.maxMarks === null || body.maxMarks === "" || body.maxMarks === undefined) {
      return NextResponse.json(
        { message: "Set max marks or add subsections" },
        { status: 400 }
      );
    } else {
      const n = Number(body.maxMarks);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { message: "maxMarks must be a positive number" },
          { status: 400 }
        );
      }
      maxMarks = n;
    }

    const examType =
      (await prisma.examType.findFirst({
        where: { schoolId, name: examTypeName },
        select: { id: true },
      })) ??
      (await prisma.examType.create({
        data: {
          id: randomUUID(),
          name: examTypeName,
          schoolId,
          maxMarks: null,
        },
        select: { id: true },
      }));

    const subjectClient = (
      prisma as unknown as {
        examTypeSubject?: {
          findFirst: (args: unknown) => Promise<{
            id: string;
            subject: string;
            maxMarks: number | null;
            sections: Array<{ id: string; name: string; maxMarks: number; order: number }>;
          } | null>;
          create: (args: unknown) => Promise<unknown>;
          update: (args: unknown) => Promise<unknown>;
          findUniqueOrThrow: (args: unknown) => Promise<{
            id: string;
            subject: string;
            maxMarks: number | null;
            sections: Array<{ id: string; name: string; maxMarks: number; order: number }>;
          }>;
        };
      }
    ).examTypeSubject;

    const existing = subjectClient
      ? await subjectClient.findFirst({
          where: {
            examTypeId: examType.id,
            subject: { equals: subject, mode: "insensitive" },
          },
          select: subjectSelect,
        })
      : (
          await prisma.$queryRaw<
            Array<{ id: string; subject: string; maxMarks: number | null }>
          >`
            SELECT id, subject, "maxMarks"
            FROM "ExamTypeSubject"
            WHERE "examTypeId" = ${examType.id}
              AND upper(subject) = ${subject}
            LIMIT 1
          `
        ).map((row) => ({ ...row, sections: [] as Array<{ id: string; name: string; maxMarks: number; order: number }> }))[0] ?? null;

    if (existing && !subjectClient) {
      existing.sections = await prisma.$queryRaw<
        Array<{ id: string; name: string; maxMarks: number; order: number }>
      >`
        SELECT id, name, "maxMarks", "order"
        FROM "ExamTypeSubjectSection"
        WHERE "examTypeSubjectId" = ${existing.id}
        ORDER BY "order" ASC
      `;
    }

    const sectionsProvided = Array.isArray(body.sections);
    const sameMax =
      existing != null &&
      existing.maxMarks != null &&
      maxMarks != null &&
      Number(existing.maxMarks) === Number(maxMarks);

    if (existing && sameMax && !sectionsProvided) {
      return NextResponse.json(
        {
          unchanged: true,
          message: `${existing.subject} already has max marks ${existing.maxMarks} for ${examTypeName}.`,
          subjectConfig: {
            subject: existing.subject,
            maxMarks: existing.maxMarks,
            sections: existing.sections,
          },
        },
        { status: 200 }
      );
    }

    const now = new Date();
    const subjectId = existing?.id ?? randomUUID();
    if (subjectClient) {
      if (!existing) {
        await subjectClient.create({
          data: {
            id: subjectId,
            examTypeId: examType.id,
            subject,
            maxMarks,
            ...(sectionsProvided && parsed.length > 0
              ? {
                  sections: {
                    create: parsed.map((s) => ({
                      id: randomUUID(),
                      name: s.name,
                      maxMarks: s.maxMarks,
                      order: s.order,
                      updatedAt: now,
                    })),
                  },
                }
              : {}),
          },
        });
      } else if (!sectionsProvided) {
        await subjectClient.update({
          where: { id: subjectId },
          data: { maxMarks },
        });
      } else {
        await subjectClient.update({
          where: { id: subjectId },
          data: {
            subject,
            maxMarks,
            sections: {
              deleteMany: {},
              ...(parsed.length > 0
                ? {
                    create: parsed.map((s) => ({
                      id: randomUUID(),
                      name: s.name,
                      maxMarks: s.maxMarks,
                      order: s.order,
                      updatedAt: now,
                    })),
                  }
                : {}),
            },
          },
        });
      }
    } else if (!existing) {
      await prisma.$executeRaw`
        INSERT INTO "ExamTypeSubject" (id, "examTypeId", subject, "maxMarks", "createdAt", "updatedAt")
        VALUES (${subjectId}, ${examType.id}, ${subject}, ${maxMarks}, ${now}, ${now})
      `;
      if (sectionsProvided && parsed.length > 0) {
        for (const s of parsed) {
          await prisma.$executeRaw`
            INSERT INTO "ExamTypeSubjectSection" (id, "examTypeSubjectId", name, "maxMarks", "order", "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${subjectId}, ${s.name}, ${s.maxMarks}, ${s.order}, ${now}, ${now})
          `;
        }
      }
    } else if (!sectionsProvided) {
      await prisma.$executeRaw`
        UPDATE "ExamTypeSubject"
        SET "maxMarks" = ${maxMarks}, "updatedAt" = ${now}
        WHERE id = ${subjectId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "ExamTypeSubject"
        SET subject = ${subject}, "maxMarks" = ${maxMarks}, "updatedAt" = ${now}
        WHERE id = ${subjectId}
      `;
      await prisma.$executeRaw`
        DELETE FROM "ExamTypeSubjectSection" WHERE "examTypeSubjectId" = ${subjectId}
      `;
      for (const s of parsed) {
        await prisma.$executeRaw`
          INSERT INTO "ExamTypeSubjectSection" (id, "examTypeSubjectId", name, "maxMarks", "order", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${subjectId}, ${s.name}, ${s.maxMarks}, ${s.order}, ${now}, ${now})
        `;
      }
    }

    const saved = subjectClient
      ? await subjectClient.findUniqueOrThrow({
          where: { id: subjectId },
          select: subjectSelect,
        })
      : await (async () => {
          const rows = await prisma.$queryRaw<
            Array<{ id: string; subject: string; maxMarks: number | null }>
          >`
            SELECT id, subject, "maxMarks" FROM "ExamTypeSubject" WHERE id = ${subjectId} LIMIT 1
          `;
          const row = rows[0];
          if (!row) throw new Error("Subject marks were not saved");
          const sections = await prisma.$queryRaw<
            Array<{ id: string; name: string; maxMarks: number; order: number }>
          >`
            SELECT id, name, "maxMarks", "order"
            FROM "ExamTypeSubjectSection"
            WHERE "examTypeSubjectId" = ${subjectId}
            ORDER BY "order" ASC
          `;
          return { ...row, sections };
        })();

    return NextResponse.json(
      {
        unchanged: false,
        message: "Saved",
        subjectConfig: {
          subject: saved.subject,
          maxMarks: saved.maxMarks,
          sections: saved.sections,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("Exam type subject config PUT:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
