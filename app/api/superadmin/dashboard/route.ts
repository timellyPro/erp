import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

/**
 * Superadmin dashboard – single API returning all dashboard data.
 * GET /api/superadmin/dashboard
 * Requires SUPERADMIN role.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Run sequentially so a tiny PgBouncer pool (connection_limit 1–5) is not exhausted
    // by Promise.all while individual queries are slow (often 5–20s).
    const totalSchools = await prisma.school.count();
    const totalStudents = await prisma.student.count();
    const schoolsList = await prisma.school.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        location: true,
        admins: {
          take: 1,
          orderBy: { name: "asc" },
          select: { photoUrl: true },
        },
        _count: { select: { students: true, teachers: true, classes: true } },
      },
    });
    const recentPayments = await prisma.payment.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      where: { status: "SUCCESS" },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        student: {
          select: {
            user: { select: { name: true } },
            school: { select: { id: true, name: true } },
          },
        },
      },
    });
    const totalTeachers = await prisma.user.count({ where: { role: "TEACHER" } });

    const schools = schoolsList.map((s) => ({
      id: s.id,
      name: s.name,
      location: s.location ?? "",
      photoUrl: s.admins[0]?.photoUrl ?? null,
      studentCount: s._count.students,
      teacherCount: s._count.teachers,
      classCount: s._count.classes,
    }));

    const feeTransactions = recentPayments
      .filter((p) => p.student?.school)
      .map((p, idx) => ({
        id: p.id,
        slNo: idx + 1,
        amount: p.amount,
        schoolId: p.student!.school!.id,
        schoolName: p.student!.school!.name,
        studentName: p.student!.user?.name ?? "—",
        createdAt: p.createdAt,
      }));

    const payload = {
      stats: {
        totalSchools,
        totalStudents,
        totalTeachers,
      },
      schools,
      feeTransactions,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    console.error("Superadmin dashboard:", e);
    
    // Handle database connection errors
    const err = e as { code?: string; message?: string; name?: string };
    if (err?.code === "P1001" || err?.message?.includes("Can't reach database server") || err?.name === "PrismaClientInitializationError") {
      return NextResponse.json(
        { message: "Database connection failed. Please check your database configuration." },
        { status: 503 }
      );
    }
    
    if (err?.message?.includes("statement timeout") || err?.message?.includes("Connection terminated")) {
      return NextResponse.json(
        { message: "Database request timed out. Please try again." },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
