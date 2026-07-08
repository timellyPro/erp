import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { invalidateStudentListCaches } from "@/lib/invalidateStudentListCaches";
import { purgeSchoolDashboardServerCacheMatching } from "@/lib/schoolDashboardServerCache";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";
import { requireSchoolId } from "@/lib/tenant";
import {
  buildTuitionBulkCache,
  upsertStudentFeeFromStructure,
} from "@/lib/studentTuitionFromStructure";

const STAFF_ROLES = new Set(["SCHOOLADMIN", "SUPERADMIN", "TEACHER"]);

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!STAFF_ROLES.has(session.user.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const ctx = await requireSchoolId(session);
    if (!ctx.ok) {
      return NextResponse.json({ message: ctx.message }, { status: ctx.status });
    }
    const schoolId = ctx.schoolId;

    const body = await req.json();
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && id.trim().length > 0
          )
          .map((id: string) => id.trim())
      : [];
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";

    if (studentIds.length === 0) {
      return NextResponse.json(
        { message: "At least one student is required" },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { message: "Target class is required" },
        { status: 400 }
      );
    }

    const uniqueStudentIds = [...new Set(studentIds)];

    const classData = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, section: true },
    });

    if (!classData) {
      return NextResponse.json(
        { message: "Class not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        id: { in: uniqueStudentIds },
      },
      select: {
        id: true,
        classId: true,
        residencyType: true,
        fee: { select: { discountPercent: true, amountPaid: true } },
      },
    });

    if (students.length !== uniqueStudentIds.length) {
      return NextResponse.json(
        { message: "One or more students were not found in your school" },
        { status: 404 }
      );
    }

    const toUpdate = students.filter((s) => s.classId !== classId);
    if (toUpdate.length === 0) {
      return NextResponse.json(
        {
          message: "All selected students are already in this section",
          updatedCount: 0,
          class: classData,
        },
        { status: 200 }
      );
    }

    const targetIds = toUpdate.map((s) => s.id);

    await prisma.$transaction(async (tx) => {
      await tx.student.updateMany({
        where: { schoolId, id: { in: targetIds } },
        data: { classId },
      });

      const cache = await buildTuitionBulkCache(tx, schoolId, [classId]);

      for (const student of toUpdate) {
        await upsertStudentFeeFromStructure(
          tx,
          {
            schoolId,
            studentId: student.id,
            classId,
            section: classData.section ?? null,
            discountPercent: student.fee?.discountPercent ?? 0,
            amountPaid: student.fee?.amountPaid ?? 0,
            residencyType: student.residencyType,
          },
          cache
        );
      }
    });

    for (const student of toUpdate) {
      invalidateStudentFeeReadCaches({ studentId: student.id, schoolId });
    }
    invalidateStudentListCaches(schoolId);
    purgeSchoolDashboardServerCacheMatching(`class:list:lite:${schoolId}`);
    purgeSchoolDashboardServerCacheMatching(`students:list:${schoolId}`);

    return NextResponse.json(
      {
        message: `Assigned ${toUpdate.length} student${toUpdate.length === 1 ? "" : "s"} to section successfully`,
        updatedCount: toUpdate.length,
        class: classData,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Bulk assign student to class error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
