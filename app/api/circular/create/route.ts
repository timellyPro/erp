import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { generateRefNumber } from "@/lib/utils";
import { CIRCULAR_REF_PREFIX } from "@/lib/constants";
import {
  createNotificationsForUserIds,
  getSchoolUserIds,
} from "@/lib/notificationService";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    return await runInTenantScope(schoolId, async () => {

    const createCircularBodySchema = z.object({
      referenceNumber: z.string().optional().nullable(),
      date: z.string().optional().nullable(),
      subject: z.string().optional(),
      content: z.string().optional(),
      attachments: z.array(z.string()).optional().nullable(),
      importanceLevel: z.string().optional().nullable(),
      recipients: z.array(z.string()).optional().nullable(),
      classId: z.string().optional().nullable(),
      publishStatus: z.string().optional().nullable(),
    });
    const parsedBody = createCircularBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Subject and content are required" },
        { status: 400 }
      );
    }
    const {
      referenceNumber,
      date,
      subject,
      content,
      attachments,
      importanceLevel,
      recipients,
      classId,
      publishStatus,
    } = parsedBody.data;

    if (!subject || !content) {
      return NextResponse.json(
        { message: "Subject and content are required" },
        { status: 400 }
      );
    }

    const year = new Date(date || Date.now()).getFullYear();
    const count = await prisma.circular.count({ where: { schoolId } });
    const ref = referenceNumber || generateRefNumber(CIRCULAR_REF_PREFIX, year, count + 1);

    const circular = await prisma.circular.create({
      data: {
        schoolId,
        issuedById: session.user.id,
        referenceNumber: ref,
        date: date ? new Date(date) : new Date(),
        subject,
        content,
        attachments: Array.isArray(attachments) ? attachments : [],
        importanceLevel: importanceLevel || "Medium",
        recipients: Array.isArray(recipients) && recipients.length > 0 ? recipients : ["all"],
        classId: classId || null,
        publishStatus: publishStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      },
    });

    if (circular.publishStatus === "PUBLISHED") {
      try {
        const userIds = await getSchoolUserIds(schoolId);
        await createNotificationsForUserIds(
          userIds.filter((id) => id !== session.user.id),
          "CIRCULAR",
          "New circular",
          subject.length > 80 ? subject.slice(0, 80) + "…" : subject
        );
      } catch (nErr) {
        logger.warn("Circular notification creation failed:", nErr);
      }
    }

    return NextResponse.json({ circular }, { status: 201 });
    });
  } catch (e: unknown) {
    logger.error("Circular create:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
