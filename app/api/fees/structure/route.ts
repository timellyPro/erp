import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { saveClassFeeStructureAndSyncStudents } from "@/lib/fees/classFeeStructureApply";
import { finalFeeFromStructureAndExtras, sumExtraFeesForStudent } from "@/lib/fees/studentTuitionFromStructure";
import { invalidateSchoolFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    return await runInTenantScope(schoolId, async () => {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    if (!classId) {
      const memKey = `fees:structure:${schoolId}`;
      const cached = getSchoolDashboardServerCached<{ structures: unknown[] }>(memKey);
      if (cached) {
        return NextResponse.json(cached, { status: 200 });
      }
    }

    const where: { schoolId: string; classId?: string } = { schoolId };
    if (classId) where.classId = classId;

    const structures = await prisma.classFeeStructure.findMany({
      where,
      include: { class: { select: { id: true, name: true, section: true } } },
    });

    const payload = { structures };
    if (!classId) {
      setSchoolDashboardServerCached(`fees:structure:${schoolId}`, payload, 45_000);
    }
    return NextResponse.json(payload);
    });
  } catch (error: unknown) {
    logger.error("Fee structure GET error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async () => {

    const structureBodySchema = z.object({
      classId: z.string().optional(),
      components: z.array(z.unknown()).optional(),
    });
    const parsedBody = structureBodySchema.safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    const { classId, components } = body;

    if (!classId || !Array.isArray(components)) {
      return NextResponse.json(
        { message: "classId and components (array) required" },
        { status: 400 }
      );
    }

    const classInSchool = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true },
    });
    if (!classInSchool) {
      return NextResponse.json(
        { message: "Class not found in your school" },
        { status: 404 }
      );
    }

    try {
      const { structure } = await saveClassFeeStructureAndSyncStudents({
        schoolId,
        classId,
        components,
      });
      await invalidateSchoolFeeReadCaches(schoolId);
      return NextResponse.json({ structure });
    } catch (applyErr: unknown) {
      const msg = String(getErrorMessage(applyErr) || "");
      if (msg.includes("Each component must have name")) {
        return NextResponse.json({ message: msg }, { status: 400 });
      }
      throw applyErr;
    }
    });
  } catch (error: unknown) {
    logger.error("Fee structure PUT error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ message: "classId required" }, { status: 400 });
    }

    // Avoid long interactive transactions (can throw P2028 "Transaction not found")
    // when many student fee rows are updated.
    await prisma.classFeeStructure.deleteMany({
      where: { classId, schoolId },
    });

    const students = await prisma.student.findMany({
      where: { classId, schoolId },
      include: { class: { select: { section: true } }, fee: true },
    });

    const extraFees = await prisma.extraFee.findMany({
      where: { schoolId },
      select: {
        name: true,
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
        residencyScope: true,
      },
    });

    const chunkSize = 8;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (student) => {
          const fee = student.fee;
          if (!fee) return;

          const extraTotal = sumExtraFeesForStudent(extraFees, {
            classId,
            section: student.class?.section ?? null,
            studentId: student.id,
            residencyType: student.residencyType ?? "Day Scholar",
          });

          const newFinalFee = finalFeeFromStructureAndExtras(0, extraTotal, fee.discountPercent);
          const newRemainingFee = Math.max(0, newFinalFee - fee.amountPaid);

          await prisma.studentFee.update({
            where: { studentId: student.id },
            data: {
              totalFee: extraTotal,
              finalFee: newFinalFee,
              remainingFee: newRemainingFee,
            },
          });
        })
      );
    }

    await invalidateSchoolFeeReadCaches(schoolId);
    return NextResponse.json({ success: true });
    });
  } catch (error: unknown) {
    logger.error("Fee structure DELETE error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
