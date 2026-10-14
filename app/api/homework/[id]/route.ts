import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

type RouteContext = { params: Promise<{ id: string }> | { params: { id: string } } };

function resolveId(raw: { id?: string; params?: { id: string } }): string {
  return raw.id ?? raw.params?.id ?? "";
}

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const c = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = c?.schoolId ?? null;
  }
  return schoolId;
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const raw = "then" in context.params ? await context.params : context.params;
    const id = resolveId(raw as { id?: string; params?: { id: string } });

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const updateHomeworkBodySchema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      subject: z.string().optional(),
      classId: z.string().optional(),
      dueDate: z.string().optional().nullable(),
      assignedDate: z.string().optional().nullable(),
      file: z.string().optional().nullable(),
    });
    const parsedBody = updateHomeworkBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const { title, description, subject, classId, dueDate, assignedDate, file: fileUrl } = parsedBody.data;

    const existing = await prisma.homework.findFirst({
      where: { id, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ message: "Homework not found" }, { status: 404 });
    }

    const updateData: {
      title?: string;
      description?: string;
      subject?: string;
      classId?: string;
      dueDate?: Date | null;
      assignedDate?: Date | null;
      file?: string | null;
    } = {};

    if (title !== undefined) updateData.title = String(title).trim();
    if (description !== undefined) updateData.description = String(description).trim();
    if (subject !== undefined) updateData.subject = String(subject).trim();
    if (classId !== undefined) {
      const cls = await prisma.class.findFirst({
        where: { id: classId, schoolId },
      });
      if (!cls) {
        return NextResponse.json({ message: "Class not found or doesn't belong to your school" }, { status: 400 });
      }
      updateData.classId = classId;
    }
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (assignedDate !== undefined) updateData.assignedDate = assignedDate ? new Date(assignedDate) : null;
    if (fileUrl !== undefined) updateData.file = typeof fileUrl === "string" && fileUrl.trim() ? fileUrl.trim() : null;

    const homework = await prisma.homework.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(homework, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("Homework update error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const raw = "then" in context.params ? await context.params : context.params;
    const id = resolveId(raw as { id?: string; params?: { id: string } });

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const existing = await prisma.homework.findFirst({
      where: { id, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ message: "Homework not found" }, { status: 404 });
    }

    await prisma.homework.delete({ where: { id } });
    return NextResponse.json({ message: "Homework deleted" }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("Homework delete error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
