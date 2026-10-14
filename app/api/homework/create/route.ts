import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { createNotificationsForUserIds } from "@/lib/notificationService";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const createHomeworkBodySchema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      subject: z.string().optional(),
      classId: z.string().optional(),
      dueDate: z.string().optional().nullable(),
      assignedDate: z.string().optional().nullable(),
      file: z.string().optional().nullable(),
    });
    const parsedBody = createHomeworkBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Title, description, subject, and class are required" },
        { status: 400 }
      );
    }
    const { title, description, subject, classId, dueDate, assignedDate, file: fileUrl } = parsedBody.data;

    if (!title || !description || !subject || !classId ) {
      return NextResponse.json(
        { message: "Title, description, subject, and class are required" },
        { status: 400 }
      );
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const teacherClass = await prisma.class.findFirst({
        where: { teacherId: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherClass?.schoolId ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        id: classId,
        schoolId: schoolId,
      },
    });

    if (!classData) {
      return NextResponse.json(
        { message: "Class not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    const homework = await prisma.homework.create({
      data: {
        title,
        description,
        subject,
        classId,
        teacherId: session.user.id,
        schoolId,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedDate: assignedDate ? new Date(assignedDate) : null,
        file: typeof fileUrl === "string" && fileUrl.trim() ? fileUrl.trim() : null,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            section: true,
            _count: { select: { students: true } },
          },
        },
        _count: { select: { submissions: true } },
      },
    });

    const students = await prisma.student.findMany({
      where: { classId },
      select: { userId: true },
    });
    const userIds = students.map((s) => s.userId);
    if (userIds.length > 0) {
      createNotificationsForUserIds(
        userIds,
        "HOMEWORK",
        "New homework",
        title.length > 60 ? title.slice(0, 60) + "…" : title
      ).catch(() => {});
    }

    return NextResponse.json(
      { message: "Homework created successfully", homework },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Create homework error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
