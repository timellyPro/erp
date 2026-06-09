import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolIdForSession } from "../extra-head-templates/resolveSchoolId";
import {
  getAssignCatalogMemCached,
  setAssignCatalogMemCached,
} from "@/lib/assignCatalogServerCache";

const extraFeeSelect = {
  id: true,
  name: true,
  amount: true,
  targetType: true,
  targetClassId: true,
  targetSection: true,
  targetStudentId: true,
  residencyScope: true,
  splitIntoTwoInstallments: true,
} as const;

function canManage(role: string | null | undefined) {
  return role === "SCHOOLADMIN" || role === "SUPERADMIN" || role === "TEACHER";
}

/** One fast payload for Assign Fees modals (no lump migration, filtered extras). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = (searchParams.get("studentId") ?? "").trim();
    let classId = (searchParams.get("classId") ?? "").trim();
    let section = (searchParams.get("section") ?? "").trim() || null;
    const skipClasses = searchParams.get("skipClasses") === "1";

    const bypassCache = searchParams.get("refresh") === "1";
    const memKey = `${schoolId}:${studentId}:${classId}:${section ?? ""}:${skipClasses}`;
    if (!bypassCache) {
      const memHit = getAssignCatalogMemCached(memKey);
      if (memHit) {
        return NextResponse.json(memHit, { status: 200 });
      }
    }

    if (studentId && !classId) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, schoolId },
        select: {
          classId: true,
          class: { select: { id: true, section: true } },
        },
      });
      if (student?.classId) {
        classId = student.classId;
        section = student.class?.section ?? section;
      }
    }

    const catalogOr: Array<Record<string, unknown>> = [{ targetType: "SCHOOL" }];
    if (classId && section) {
      catalogOr.push(
        { targetType: "CLASS", targetClassId: classId },
        { targetType: "SECTION", targetClassId: classId, targetSection: section }
      );
    } else if (classId) {
      catalogOr.push({ targetType: "CLASS", targetClassId: classId });
    }

    const extraWhere = {
      schoolId,
      OR: [
        ...catalogOr,
        ...(studentId ? [{ targetType: "STUDENT" as const, targetStudentId: studentId }] : []),
      ],
    };

    const [templates, extraFees, classes, structureRow] = await Promise.all([
      prisma.extraFeeHeadTemplate.findMany({
        where: { schoolId },
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          amount: true,
          splitIntoTwoInstallments: true,
        },
      }),
      prisma.extraFee.findMany({
        where: extraWhere,
        orderBy: { createdAt: "desc" },
        select: extraFeeSelect,
        take: 500,
      }),
      skipClasses
        ? Promise.resolve([] as Array<{ id: string; name: string; section: string | null }>)
        : prisma.class.findMany({
            where: { schoolId },
            select: { id: true, name: true, section: true },
            orderBy: [{ name: "asc" }, { section: "asc" }],
          }),
      classId
        ? prisma.classFeeStructure.findUnique({
            where: { classId },
            select: { components: true, schoolId: true },
          })
        : Promise.resolve(null),
    ]);

    const catalogExtras = extraFees.filter((ef) =>
      ["SCHOOL", "CLASS", "SECTION"].includes(ef.targetType)
    );
    const existingStudentExtras = studentId
      ? extraFees
          .filter((ef) => ef.targetType === "STUDENT" && ef.targetStudentId === studentId)
          .map((ef) => ({
            id: ef.id,
            name: ef.name,
            amount: ef.amount,
            splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
          }))
      : [];

    let classBaseFeeTotal: number | null = null;
    if (structureRow && structureRow.schoolId === schoolId) {
      const components = Array.isArray(structureRow.components)
        ? (structureRow.components as { amount?: number }[])
        : [];
      const total = components.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
      classBaseFeeTotal = total > 0 ? total : null;
    }

    const payload = {
      templates,
      catalogExtras,
      existingStudentExtras,
      classBaseFeeTotal,
      classes,
      resolvedClassId: classId || null,
      resolvedSection: section,
    };
    setAssignCatalogMemCached(memKey, payload);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("assign-catalog GET error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
