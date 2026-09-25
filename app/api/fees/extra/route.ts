import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  extraFeeAppliesToStudent,
  parseExtraFeeResidencyScopeBody,
  suggestedResidencyScopeForExtraFeeName,
} from "@/lib/extraFeeResidencyScope";
import { createExtraFeeRows, migrateUnsplitLumpExtraFees, type ExtraFeeCreatePayload } from "@/lib/extraFeeInstallmentDb";
import { isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";
import { invalidateAssignCatalogServerCache } from "@/lib/assignCatalogServerCache";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  if (!schoolId) {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
  }
  if (!schoolId) {
    const teacherSchool = await prisma.school.findFirst({
      where: { teachers: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = teacherSchool?.id ?? null;
  }
  return schoolId;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const runMaintenance = searchParams.get("maintenance") === "1";

    if (!runMaintenance) {
      const memKey = `fees:extra:${schoolId}`;
      const cached = getSchoolDashboardServerCached<{ extraFees: unknown[] }>(memKey);
      if (cached) {
        return NextResponse.json(cached, { status: 200 });
      }
    }

    let extraFees = await prisma.extraFee.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });

    if (runMaintenance) {
      const lumps = extraFees.filter((ef) =>
        isUnsplitLumpExtraFee({
          name: ef.name,
          splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
        })
      );
      if (lumps.length > 0) {
        await migrateUnsplitLumpExtraFees(
          prisma,
          lumps.map((ef) => ({
            id: ef.id,
            schoolId: ef.schoolId,
            name: ef.name,
            amount: ef.amount,
            targetType: ef.targetType,
            targetClassId: ef.targetClassId,
            targetSection: ef.targetSection,
            targetStudentId: ef.targetStudentId,
            residencyScope: ef.residencyScope,
            splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
          }))
        );
        extraFees = await prisma.extraFee.findMany({
          where: { schoolId },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    const payload = { extraFees };
    if (!runMaintenance) {
      setSchoolDashboardServerCached(`fees:extra:${schoolId}`, payload, 30_000);
    }
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Extra fees GET error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const { name, amount, targetType, targetClassId, targetSection, targetStudentId } = body;
    const splitIntoTwoInstallments = Boolean(body.splitIntoTwoInstallments);
    const parsedScope = parseExtraFeeResidencyScopeBody(body.residencyScope);
    if (parsedScope === null) {
      return NextResponse.json(
        { message: "residencyScope must be ALL, HOSTELLER, or DAY_SCHOLAR when provided" },
        { status: 400 }
      );
    }
    let residencyScope = parsedScope;
    const suggested = suggestedResidencyScopeForExtraFeeName(String(name).trim());
    if (parsedScope === "ALL" && suggested !== "ALL") {
      residencyScope = suggested;
    }

    if (!name || typeof amount !== "number" || amount <= 0 || !targetType) {
      return NextResponse.json(
        { message: "name, amount (positive number), and targetType (SCHOOL|CLASS|SECTION|STUDENT) required" },
        { status: 400 }
      );
    }

    const validTypes = ["SCHOOL", "CLASS", "SECTION", "STUDENT"];
    if (!validTypes.includes(targetType)) {
      return NextResponse.json(
        { message: "targetType must be SCHOOL, CLASS, SECTION, or STUDENT" },
        { status: 400 }
      );
    }

    if (targetType === "CLASS" && !targetClassId) {
      return NextResponse.json({ message: "targetClassId required when targetType is CLASS" }, { status: 400 });
    }
    if (targetType === "SECTION" && (!targetClassId || !targetSection)) {
      return NextResponse.json({ message: "targetClassId and targetSection required when targetType is SECTION" }, { status: 400 });
    }
    if (targetType === "STUDENT" && !targetStudentId) {
      return NextResponse.json({ message: "targetStudentId required when targetType is STUDENT" }, { status: 400 });
    }

    const payload: ExtraFeeCreatePayload = {
      schoolId,
      name: String(name).trim(),
      amount: Number(amount),
      targetType,
      targetClassId: targetClassId || null,
      targetSection: targetSection || null,
      targetStudentId: targetStudentId || null,
      residencyScope,
      splitIntoTwoInstallments,
    };

    const { ids, totalAmount } = await createExtraFeeRows(prisma, payload);
    const extraFee = await prisma.extraFee.findFirst({
      where: { id: ids[0] },
    });

    const studentWhere =
      targetType === "SCHOOL"
        ? { schoolId }
        : targetType === "SECTION" && targetClassId && targetSection
          ? { schoolId, classId: targetClassId, class: { section: targetSection } }
          : targetType === "CLASS" && targetClassId
            ? { schoolId, classId: targetClassId }
            : targetType === "STUDENT" && targetStudentId
              ? { schoolId, id: targetStudentId }
              : null;

    if (studentWhere) {
      const students = await prisma.student.findMany({
        where: studentWhere,
        select: { id: true, residencyType: true },
      });
      const eligibleStudentIds = students
        .filter((s) =>
          extraFeeAppliesToStudent({ name: String(name).trim(), residencyScope }, s.residencyType)
        )
        .map((s) => s.id);

      if (eligibleStudentIds.length > 0) {
        await prisma.studentFee.updateMany({
          where: { studentId: { in: eligibleStudentIds } },
          data: {
            totalFee: { increment: totalAmount },
            finalFee: { increment: totalAmount },
            remainingFee: { increment: totalAmount },
          },
        });
      }
    }

    invalidateAssignCatalogServerCache(schoolId);
    if (targetType === "STUDENT" && targetStudentId) {
      invalidateStudentFeeReadCaches({ studentId: String(targetStudentId), schoolId });
    }

    return NextResponse.json({ extraFee, extraFeeIds: ids }, { status: 201 });
  } catch (error: any) {
    console.error("Extra fee POST error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
