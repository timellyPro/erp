import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * List all schools for superadmin with admin info, student count, turnover, isActive.
 * GET /api/superadmin/schools
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      select: {
        id: true,
        name: true,
        address: true,
        location: true,
        createdAt: true,
        isActive: true,
        billingMode: true,
        parentSubscriptionAmount: true,
        parentSubscriptionTrialDays: true,
        _count: { select: { students: true, teachers: true, classes: true } },
        admins: {
          take: 1,
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, mobile: true, role: true, photoUrl: true },
        },
      },
    });

    const schoolIds = schools.map((s) => s.id);
    const turnoverBySchool: Record<string, number> = {};
    if (schoolIds.length > 0) {
      const list = await prisma.payment.findMany({
        where: { status: "SUCCESS", student: { schoolId: { in: schoolIds } } },
        select: { amount: true, student: { select: { schoolId: true } } },
      });
      for (const p of list) {
        const sid = p.student.schoolId;
        turnoverBySchool[sid] = (turnoverBySchool[sid] ?? 0) + p.amount;
      }
    }

    const list = schools.map((s, index) => ({
      slNo: index + 1,
      id: s.id,
      name: s.name,
      address: s.address ?? "",
      location: s.location ?? "",
      isActive: s.isActive,
      createdAt: s.createdAt,
      studentCount: s._count.students,
      teacherCount: s._count.teachers,
      classCount: s._count.classes,
      turnover: turnoverBySchool[s.id] ?? 0,
      billingMode: s.billingMode ?? "PARENT_SUBSCRIPTION",
      parentSubscriptionAmount: s.parentSubscriptionAmount ?? null,
      parentSubscriptionTrialDays: s.parentSubscriptionTrialDays ?? 0,
      admin: s.admins[0]
        ? {
            id: s.admins[0].id,
            name: s.admins[0].name ?? "-",
            email: s.admins[0].email ?? "-",
            mobile: s.admins[0].mobile ?? "-",
            role: s.admins[0].role,
            photoUrl: s.admins[0].photoUrl ?? null,
          }
        : null,
    }));

    const totalAmount = Object.values(turnoverBySchool).reduce((a, b) => a + b, 0);
    const totalTransactionCount = schoolIds.length > 0
      ? await prisma.payment.count({ where: { status: "SUCCESS", student: { schoolId: { in: schoolIds } } } })
      : 0;

    return NextResponse.json({
      schools: list,
      totalTransactionCount,
      totalAmount,
    }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Superadmin schools list:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
