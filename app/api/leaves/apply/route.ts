import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { getServerSession } from "next-auth";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const VALID_LEAVE_TYPES = ["CASUAL", "SICK", "PAID", "UNPAID"] as const;

const applyLeaveBodySchema = z.object({
  leaveType: z.string().optional(),
  reason: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const parsedBody = applyLeaveBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { leaveType, reason, fromDate, toDate } = parsedBody.data;

    if (!leaveType || !fromDate || !toDate) {
      return NextResponse.json(
        { error: "Missing required fields: leaveType, fromDate, toDate" },
        { status: 400 }
      );
    }

    const normalizedType = (VALID_LEAVE_TYPES as readonly string[]).includes(leaveType)
      ? (leaveType as (typeof VALID_LEAVE_TYPES)[number])
      : "CASUAL";
    const reasonStr = typeof reason === "string" ? reason.trim() : "";

    let schoolId: string | null = user.schoolId ?? null;
    if (!schoolId && user.role === "TEACHER") {
      const teacherSchool = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          schoolId: true,
          teacherSchools: { take: 1, select: { id: true } },
          assignedClasses: { take: 1, select: { schoolId: true } },
        },
      });
      schoolId =
        teacherSchool?.schoolId ??
        teacherSchool?.teacherSchools?.[0]?.id ??
        teacherSchool?.assignedClasses?.[0]?.schoolId ??
        null;
    }

    if (!schoolId) {
      return NextResponse.json(
        { error: "School not found. Your account may not be assigned to a school." },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: "From date must be on or before to date." }, { status: 400 });
    }

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        teacherId: user.id,
        status: { not: "REJECTED" },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });

    if (overlap) {
      return NextResponse.json(
        { error: "Leave already exists for this period" },
        { status: 409 }
      );
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        teacherId: user.id,
        schoolId,
        leaveType: normalizedType,
        reason: reasonStr || "—",
        fromDate: from,
        toDate: to,
      },
    });

    return NextResponse.json(leave, { status: 201 });
    });
  } catch (e: unknown) {
    const message = toClientErrorMessage(e, "Internal Server Error");
    logger.error("Leaves apply error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
