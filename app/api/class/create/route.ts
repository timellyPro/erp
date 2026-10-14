import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { purgeSchoolDashboardServerCacheMatching } from "@/lib/school/schoolDashboardServerCache";
import { requireSchoolId } from "@/lib/auth/tenant";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

const STAFF_ROLES = new Set(["SCHOOLADMIN", "SUPERADMIN", "TEACHER"]);

export async function POST(req: Request) {
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

    return await runInTenantScope(schoolId, async (schoolId) => {
    const createClassBodySchema = z.object({
      name: z.string().optional(),
      section: z.string().optional().nullable(),
      teacherId: z.string().optional().nullable(),
    });
    const parsedBody = createClassBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Class name is required" }, { status: 400 });
    }
    const { name, section, teacherId } = parsedBody.data;

    if (!name) {
      return NextResponse.json(
        { message: "Class name is required" },
        { status: 400 }
      );
    }

    // Verify teacher belongs to the same school if teacherId is provided
    if (teacherId) {
      const teacher = await prisma.user.findFirst({
        where: {
          id: teacherId,
          schoolId: schoolId,
          role: "TEACHER",
        },
      });

      if (!teacher) {
        return NextResponse.json(
          { message: "Teacher not found or doesn't belong to your school" },
          { status: 400 }
        );
      }
    }

    const classData = await prisma.class.create({
      data: {
        name,
        section: section || null,
        schoolId,
        teacherId: teacherId || null,
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        school: {
          select: { id: true, name: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
    purgeSchoolDashboardServerCacheMatching(`class:list:lite:${schoolId}`);

    return NextResponse.json(
      { message: "Class created successfully", class: classData },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Class creation error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}

