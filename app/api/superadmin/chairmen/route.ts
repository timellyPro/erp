import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schools = await prisma.school.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        location: true,
      },
    });

    const chairmen = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        email: string | null;
        mobile: string | null;
        role: string;
        schoolId: string | null;
        createdAt: Date;
      }>
    >`
      SELECT id, name, email, mobile, role::text AS role, "schoolId", "createdAt"
      FROM "User"
      WHERE role::text = 'CHAIRMAN'
      ORDER BY name ASC NULLS LAST
    `;

    const chairmenBySchool = new Map<string, typeof chairmen>();
    for (const chairman of chairmen) {
      if (!chairman.schoolId) continue;
      const list = chairmenBySchool.get(chairman.schoolId) ?? [];
      list.push(chairman);
      chairmenBySchool.set(chairman.schoolId, list);
    }

    return NextResponse.json({
      schools: schools.map((school) => ({
        ...school,
        users: chairmenBySchool.get(school.id) ?? [],
      })),
    });
  } catch (error: unknown) {
    console.error("Superadmin chairmen list:", error);
    const err = error as { code?: string; message?: string };
    const message =
      err?.code === "P1001"
        ? "Database connection failed. Please check Supabase/DATABASE_URL and try again."
        : err?.message || "Failed to load chairman list";
    return NextResponse.json({ message }, { status: err?.code === "P1001" ? 503 : 500 });
  }
}
