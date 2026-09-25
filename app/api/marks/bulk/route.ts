import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma, { runWithDeferredCacheInvalidation } from "@/lib/db";
import { assertTeacherCanEnterMarks } from "@/lib/teacherMarksScope";
import {
  parseMarkComponents,
  sumComponents,
  type MarkComponentInput,
} from "@/lib/markComponents";
import { loadConfiguredMarkLimits, markLimitError } from "@/lib/examMarkLimits";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

function calculateGrade(marks: number, totalMarks: number): string {
  const percentage = (marks / totalMarks) * 100;
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

type PreparedEntry = {
  studentId: string;
  marks: number;
  totalMarks: number;
  absent: boolean;
  components: MarkComponentInput[] | null;
};

type DbComponent = { name: string; marks: number; totalMarks: number };

type DbMarkRow = {
  id: string;
  studentId: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  components: DbComponent[];
};

function readDbComponents(value: unknown): DbComponent[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  const components: DbComponent[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; marks?: unknown; totalMarks?: unknown };
    if (typeof row.name !== "string") continue;
    components.push({
      name: row.name,
      marks: Number(row.marks),
      totalMarks: Number(row.totalMarks),
    });
  }
  return components;
}

function componentsMatch(
  existing: Array<{ name: string; marks: number; totalMarks: number }>,
  next: MarkComponentInput[] | null
) {
  const incoming = next ?? [];
  if (existing.length !== incoming.length) return false;
  const byName = new Map(
    existing.map((c) => [c.name.trim().toUpperCase(), c])
  );
  for (const c of incoming) {
    const prev = byName.get(c.name.trim().toUpperCase());
    if (!prev) return false;
    if (Number(prev.marks) !== c.marks) return false;
    if (Number(prev.totalMarks) !== c.totalMarks) return false;
  }
  return true;
}

function mapDbRows(
  rows: Array<{
    id: string;
    studentId: string;
    marks: number;
    totalMarks: number;
    grade: string | null;
    components: unknown;
  }>
): DbMarkRow[] {
  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    marks: Number(row.marks),
    totalMarks: Number(row.totalMarks),
    grade: row.grade,
    components: readDbComponents(row.components),
  }));
}

async function insertCreatedMarks(opts: {
  rows: Array<{ id: string; entry: PreparedEntry; grade: string }>;
  classId: string;
  subjectName: string;
  examType: string | null;
  teacherId: string;
  now: Date;
}): Promise<DbMarkRow[]> {
  const values = Prisma.join(
    opts.rows.map(
      (row) => Prisma.sql`(
        CAST(${row.id} AS TEXT),
        CAST(${opts.subjectName} AS TEXT),
        CAST(${row.entry.marks} AS DOUBLE PRECISION),
        CAST(${row.entry.totalMarks} AS DOUBLE PRECISION),
        CAST(${row.grade} AS TEXT),
        CAST(${opts.examType} AS TEXT),
        CAST(${row.entry.studentId} AS TEXT),
        CAST(${opts.classId} AS TEXT),
        CAST(${opts.teacherId} AS TEXT),
        CAST(${opts.now} AS TIMESTAMP(3)),
        CAST(${opts.now} AS TIMESTAMP(3))
      )`
    )
  );
  const componentRows = opts.rows.flatMap((row) =>
    (row.entry.components ?? []).map((c) => ({
      id: randomUUID(),
      markId: row.id,
      name: c.name,
      marks: c.marks,
      totalMarks: c.totalMarks,
    }))
  );

  if (componentRows.length === 0) {
    const inserted = await prisma.$queryRaw<
      Array<{
        id: string;
        studentId: string;
        marks: number;
        totalMarks: number;
        grade: string | null;
      }>
    >`
      INSERT INTO "Mark" (
        id, subject, marks, "totalMarks", grade, "examType",
        "studentId", "classId", "teacherId", "createdAt", "updatedAt"
      )
      SELECT
        v.id, v.subject, v.marks, v.total_marks, v.grade, v.exam_type,
        v.student_id, v.class_id, v.teacher_id, v.created_at, v.updated_at
      FROM (VALUES ${values}) AS v(
        id, subject, marks, total_marks, grade, exam_type,
        student_id, class_id, teacher_id, created_at, updated_at
      )
      RETURNING id, "studentId", marks, "totalMarks", grade
    `;
    return mapDbRows(inserted.map((row) => ({ ...row, components: [] })));
  }

  const compValues = Prisma.join(
    componentRows.map(
      (c) => Prisma.sql`(
        CAST(${c.id} AS TEXT),
        CAST(${c.markId} AS TEXT),
        CAST(${c.name} AS TEXT),
        CAST(${c.marks} AS DOUBLE PRECISION),
        CAST(${c.totalMarks} AS DOUBLE PRECISION),
        CAST(${opts.now} AS TIMESTAMP(3)),
        CAST(${opts.now} AS TIMESTAMP(3))
      )`
    )
  );

  const inserted = await prisma.$queryRaw<
    Array<{
      id: string;
      studentId: string;
      marks: number;
      totalMarks: number;
      grade: string | null;
      components: unknown;
    }>
  >`
    WITH inserted AS (
      INSERT INTO "Mark" (
        id, subject, marks, "totalMarks", grade, "examType",
        "studentId", "classId", "teacherId", "createdAt", "updatedAt"
      )
      SELECT
        v.id, v.subject, v.marks, v.total_marks, v.grade, v.exam_type,
        v.student_id, v.class_id, v.teacher_id, v.created_at, v.updated_at
      FROM (VALUES ${values}) AS v(
        id, subject, marks, total_marks, grade, exam_type,
        student_id, class_id, teacher_id, created_at, updated_at
      )
      RETURNING id, "studentId", marks, "totalMarks", grade
    ),
    comps AS (
      INSERT INTO "MarkComponent" (
        id, "markId", name, marks, "totalMarks", "createdAt", "updatedAt"
      )
      SELECT c.id, c.mark_id, c.name, c.marks, c.total_marks, c.created_at, c.updated_at
      FROM (VALUES ${compValues}) AS c(
        id, mark_id, name, marks, total_marks, created_at, updated_at
      )
      WHERE c.mark_id IN (SELECT id FROM inserted)
      RETURNING "markId", name, marks, "totalMarks"
    )
    SELECT
      i.id,
      i."studentId",
      i.marks,
      i."totalMarks",
      i.grade,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'name', c.name,
            'marks', c.marks,
            'totalMarks', c."totalMarks"
          ))
          FROM comps c
          WHERE c."markId" = i.id
        ),
        '[]'::json
      ) AS components
    FROM inserted i
  `;
  return mapDbRows(inserted);
}

async function updateExistingMarks(opts: {
  rows: Array<{ id: string; entry: PreparedEntry; grade: string }>;
  now: Date;
}): Promise<DbMarkRow[]> {
  const values = Prisma.join(
    opts.rows.map(
      (row) => Prisma.sql`(
        ${row.id},
        CAST(${row.entry.marks} AS DOUBLE PRECISION),
        CAST(${row.entry.totalMarks} AS DOUBLE PRECISION),
        ${row.grade}
      )`
    )
  );
  const componentRows = opts.rows.flatMap((row) =>
    (row.entry.components ?? []).map((c) => ({
      id: randomUUID(),
      markId: row.id,
      name: c.name,
      marks: c.marks,
      totalMarks: c.totalMarks,
    }))
  );

  if (componentRows.length === 0) {
    const updated = await prisma.$queryRaw<
      Array<{
        id: string;
        studentId: string;
        marks: number;
        totalMarks: number;
        grade: string | null;
        components: unknown;
      }>
    >`
      WITH updated AS (
        UPDATE "Mark" AS m
        SET "marks" = v.marks,
            "totalMarks" = v.total_marks,
            "grade" = v.grade,
            "updatedAt" = ${opts.now}
        FROM (VALUES ${values}) AS v(id, marks, total_marks, grade)
        WHERE m.id = v.id
        RETURNING m.id, m."studentId", m.marks, m."totalMarks", m.grade
      ),
      removed AS (
        DELETE FROM "MarkComponent" AS c
        USING updated u
        WHERE c."markId" = u.id
        RETURNING c.id
      )
      SELECT u.id, u."studentId", u.marks, u."totalMarks", u.grade, '[]'::json AS components
      FROM updated u
      WHERE (SELECT COUNT(*) FROM removed) >= 0
    `;
    return mapDbRows(updated);
  }

  const compValues = Prisma.join(
    componentRows.map(
      (c) => Prisma.sql`(
        CAST(${c.id} AS TEXT),
        CAST(${c.markId} AS TEXT),
        CAST(${c.name} AS TEXT),
        CAST(${c.marks} AS DOUBLE PRECISION),
        CAST(${c.totalMarks} AS DOUBLE PRECISION),
        CAST(${opts.now} AS TIMESTAMP(3)),
        CAST(${opts.now} AS TIMESTAMP(3))
      )`
    )
  );

  const updated = await prisma.$queryRaw<
    Array<{
      id: string;
      studentId: string;
      marks: number;
      totalMarks: number;
      grade: string | null;
      components: unknown;
    }>
  >`
    WITH updated AS (
      UPDATE "Mark" AS m
      SET "marks" = v.marks,
          "totalMarks" = v.total_marks,
          "grade" = v.grade,
          "updatedAt" = ${opts.now}
      FROM (VALUES ${values}) AS v(id, marks, total_marks, grade)
      WHERE m.id = v.id
      RETURNING m.id, m."studentId", m.marks, m."totalMarks", m.grade
    ),
    removed AS (
      DELETE FROM "MarkComponent" AS c
      USING updated u
      WHERE c."markId" = u.id
      RETURNING c.id
    ),
    comps AS (
      INSERT INTO "MarkComponent" (
        id, "markId", name, marks, "totalMarks", "createdAt", "updatedAt"
      )
      SELECT c.id, c.mark_id, c.name, c.marks, c.total_marks, c.created_at, c.updated_at
      FROM (VALUES ${compValues}) AS c(
        id, mark_id, name, marks, total_marks, created_at, updated_at
      )
      WHERE (SELECT COUNT(*) FROM removed) >= 0
        AND c.mark_id IN (SELECT id FROM updated)
      RETURNING "markId", name, marks, "totalMarks"
    )
    SELECT
      u.id,
      u."studentId",
      u.marks,
      u."totalMarks",
      u.grade,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'name', c.name,
            'marks', c.marks,
            'totalMarks', c."totalMarks"
          ))
          FROM comps c
          WHERE c."markId" = u.id
        ),
        '[]'::json
      ) AS components
    FROM updated u
  `;
  return mapDbRows(updated);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const classId = typeof body.classId === "string" ? body.classId : "";
    const subjectName = typeof body.subject === "string" ? body.subject.trim() : "";
    const examTypeValue =
      typeof body.examType === "string" && body.examType.trim()
        ? body.examType.trim().toUpperCase()
        : null;
    const rawEntries = Array.isArray(body.entries) ? body.entries : null;

    if (!classId || !subjectName || !rawEntries || rawEntries.length === 0) {
      return NextResponse.json(
        { message: "classId, subject, and entries are required" },
        { status: 400 }
      );
    }
    if (rawEntries.length > 300) {
      return NextResponse.json(
        { message: "Too many students in one save" },
        { status: 400 }
      );
    }

    const entries: PreparedEntry[] = [];
    for (const row of rawEntries) {
      const studentId = typeof row?.studentId === "string" ? row.studentId : "";
      if (!studentId) {
        return NextResponse.json(
          { message: "Each entry needs a studentId" },
          { status: 400 }
        );
      }
      let components: MarkComponentInput[] | null = null;
      try {
        components = parseMarkComponents(row?.components);
      } catch (err) {
        return NextResponse.json(
          { message: err instanceof Error ? err.message : "Invalid components" },
          { status: 400 }
        );
      }
      const absent = row?.grade === "AB";
      let marks = Number(row?.marks);
      let totalMarks = Number(row?.totalMarks);
      if (components && components.length > 0) {
        const summed = sumComponents(components);
        marks = summed.marks;
        totalMarks = summed.totalMarks;
      }
      if (absent) marks = 0;
      if (!Number.isFinite(marks) || !Number.isFinite(totalMarks)) {
        return NextResponse.json(
          { message: "Invalid marks" },
          { status: 400 }
        );
      }
      if (marks < 0 || totalMarks <= 0 || marks > totalMarks) {
        return NextResponse.json(
          { message: "Invalid marks: marks must be between 0 and totalMarks" },
          { status: 400 }
        );
      }
      entries.push({
        studentId,
        marks,
        totalMarks,
        absent,
        components: components && components.length > 0 ? components : null,
      });
    }

    const studentIds = entries.map((e) => e.studentId);
    const [classData, scope, students, limits, existingRows] = await Promise.all([
      prisma.class.findFirst({
        where: { id: classId, schoolId },
        select: { id: true },
      }),
      assertTeacherCanEnterMarks({
        role: session.user.role,
        userId: session.user.id,
        classId,
        subject: subjectName,
      }),
      prisma.student.findMany({
        where: { id: { in: studentIds }, classId, schoolId },
        select: {
          id: true,
          user: { select: { id: true, name: true } },
        },
      }),
      examTypeValue
        ? loadConfiguredMarkLimits({
            schoolId,
            examType: examTypeValue,
            subject: subjectName,
          })
        : Promise.resolve(null),
      prisma.mark.findMany({
        where: {
          classId,
          studentId: { in: studentIds },
          subject: { equals: subjectName, mode: "insensitive" },
          examType: examTypeValue
            ? { equals: examTypeValue, mode: "insensitive" }
            : null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          studentId: true,
          marks: true,
          totalMarks: true,
          grade: true,
          createdAt: true,
          components: { select: { name: true, marks: true, totalMarks: true } },
        },
      }),
    ]);
    if (!classData) {
      return NextResponse.json(
        { message: "Class not found or doesn't belong to your school" },
        { status: 404 }
      );
    }
    if (!scope.ok) {
      return NextResponse.json({ message: scope.message }, { status: scope.status });
    }
    const studentById = new Map(students.map((s) => [s.id, s]));
    const missing = entries.find((e) => !studentById.has(e.studentId));
    if (missing) {
      return NextResponse.json(
        { message: "Student not found in this class" },
        { status: 404 }
      );
    }
    if (examTypeValue) {
      for (const entry of entries) {
        const limitMessage = markLimitError({
          limits,
          totalMarks: entry.totalMarks,
          hasComponents: !!(entry.components && entry.components.length > 0),
          examType: examTypeValue,
          subject: subjectName,
        });
        if (limitMessage) {
          return NextResponse.json({ message: limitMessage }, { status: 400 });
        }
      }
    }

    const existingByStudent = new Map<string, (typeof existingRows)[number]>();
    for (const row of existingRows) {
      if (!existingByStudent.has(row.studentId)) {
        existingByStudent.set(row.studentId, row);
      }
    }

    const teacherId = session.user.id;
    const toCreate: Array<{
      id: string;
      entry: PreparedEntry;
      grade: string;
    }> = [];
    const toUpdate: Array<{
      id: string;
      entry: PreparedEntry;
      grade: string;
    }> = [];
    const unchanged: Array<{
      id: string;
      entry: PreparedEntry;
      grade: string | null;
      components: Array<{ name: string; marks: number; totalMarks: number }>;
    }> = [];

    for (const entry of entries) {
      const grade = entry.absent
        ? "AB"
        : calculateGrade(entry.marks, entry.totalMarks);
      const existing = existingByStudent.get(entry.studentId);
      if (!existing) {
        toCreate.push({ id: randomUUID(), entry, grade });
        continue;
      }
      const same =
        Number(existing.marks) === entry.marks &&
        Number(existing.totalMarks) === entry.totalMarks &&
        (existing.grade === "AB") === entry.absent &&
        componentsMatch(existing.components, entry.components);
      if (same) {
        unchanged.push({
          id: existing.id,
          entry,
          grade: existing.grade,
          components: existing.components,
        });
        continue;
      }
      toUpdate.push({ id: existing.id, entry, grade });
    }

    const now = new Date();
    const persisted = await runWithDeferredCacheInvalidation(async () => {
      const [created, updated] = await Promise.all([
        toCreate.length > 0
          ? insertCreatedMarks({
              rows: toCreate,
              classId,
              subjectName,
              examType: examTypeValue,
              teacherId,
              now,
            })
          : Promise.resolve([]),
        toUpdate.length > 0
          ? updateExistingMarks({ rows: toUpdate, now })
          : Promise.resolve([]),
      ]);
      return [...created, ...updated];
    });
    const persistedById = new Map(persisted.map((row) => [row.id, row]));
    const written = [...toCreate, ...toUpdate];
    const missingWrite = written.find((row) => !persistedById.has(row.id));
    if (missingWrite) {
      return NextResponse.json(
        { message: "Marks were not found in the database after save. Please try again." },
        { status: 500 }
      );
    }

    const saved = [
      ...unchanged.map((row) => ({
        id: row.id,
        studentId: row.entry.studentId,
        studentName: studentById.get(row.entry.studentId)?.user?.name?.trim() || "Student",
        marks: Number(existingByStudent.get(row.entry.studentId)?.marks ?? row.entry.marks),
        totalMarks: Number(
          existingByStudent.get(row.entry.studentId)?.totalMarks ?? row.entry.totalMarks
        ),
        grade: row.grade,
        components: row.components,
        status: "already_saved" as const,
      })),
      ...written.map((row) => {
        const db = persistedById.get(row.id)!;
        return {
          id: db.id,
          studentId: db.studentId,
          studentName: studentById.get(db.studentId)?.user?.name?.trim() || "Student",
          marks: Number(db.marks),
          totalMarks: Number(db.totalMarks),
          grade: db.grade,
          components: db.components,
          status: "saved" as const,
        };
      }),
    ];

    const notify = persisted
      .map((row) => {
        const userId = studentById.get(row.studentId)?.user?.id;
        if (!userId) return null;
        const absent = row.grade === "AB";
        return {
          userId,
          type: "MARKS" as const,
          title: "Marks updated",
          message: absent
            ? `${subjectName}: Absent`
            : `${subjectName}: ${row.marks}/${row.totalMarks} - Grade ${row.grade}`,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (notify.length > 0) {
      void prisma.notification.createMany({ data: notify }).catch(() => {});
    }

    return NextResponse.json(
      { message: "Successfully saved", saved },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error: unknown) {
    console.error("Bulk marks save error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
