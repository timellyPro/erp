import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { parseScheduleTime } from "@/lib/backupScheduleUtils";
import { getOrCreateBackupSchedule } from "@/lib/sendFeesBackupEmail";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPERADMIN") {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

/**
 * GET /api/superadmin/backup-schedule
 */
export async function GET() {
  try {
    const auth = await requireSuperAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const schedule = await getOrCreateBackupSchedule();
    return NextResponse.json({
      schedule: {
        id: schedule.id,
        enabled: schedule.enabled,
        scheduleTime: schedule.scheduleTime,
        recipient: schedule.recipient,
        schoolId: schedule.schoolId,
        schoolName: schedule.school?.name ?? null,
        lastSentAt: schedule.lastSentAt?.toISOString() ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("Backup schedule GET error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/superadmin/backup-schedule
 * Body: { enabled?, scheduleTime?, recipient?, schoolId? }
 */
export async function PUT(req: Request) {
  try {
    const auth = await requireSuperAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const body = (await req.json()) as {
      enabled?: boolean;
      scheduleTime?: string;
      recipient?: string;
      schoolId?: string | null;
    };

    const existing = await getOrCreateBackupSchedule();
    const data: {
      enabled?: boolean;
      scheduleTime?: string;
      recipient?: string;
      schoolId?: string | null;
    } = {};

    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    if (body.scheduleTime !== undefined) {
      const parsed = parseScheduleTime(body.scheduleTime);
      if (!parsed) {
        return NextResponse.json({ message: "Invalid schedule time. Use HH:mm (24-hour)." }, { status: 400 });
      }
      data.scheduleTime = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
    }

    if (body.recipient !== undefined) {
      const recipient = body.recipient.trim();
      if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        return NextResponse.json({ message: "Invalid recipient email" }, { status: 400 });
      }
      data.recipient = recipient;
    }

    if (body.schoolId !== undefined) {
      if (body.schoolId === null || body.schoolId === "") {
        data.schoolId = null;
      } else {
        const school = await prisma.school.findUnique({
          where: { id: body.schoolId },
          select: { id: true },
        });
        if (!school) {
          return NextResponse.json({ message: "School not found" }, { status: 404 });
        }
        data.schoolId = body.schoolId;
      }
    }

    const updated = await prisma.backupEmailSchedule.update({
      where: { id: existing.id },
      data,
      include: { school: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      schedule: {
        id: updated.id,
        enabled: updated.enabled,
        scheduleTime: updated.scheduleTime,
        recipient: updated.recipient,
        schoolId: updated.schoolId,
        schoolName: updated.school?.name ?? null,
        lastSentAt: updated.lastSentAt?.toISOString() ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("Backup schedule PUT error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
