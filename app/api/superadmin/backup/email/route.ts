import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getOrCreateBackupSchedule, sendFeesBackupEmail } from "@/lib/sendFeesBackupEmail";

/**
 * POST /api/superadmin/backup/email
 * Send fees backup Excel immediately to the configured (or override) recipient.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      recipient?: string;
      schoolId?: string | null;
    };

    const schedule = await getOrCreateBackupSchedule();
    const recipient = body.recipient?.trim() || schedule.recipient;
    const schoolId = body.schoolId !== undefined ? body.schoolId : schedule.schoolId;

    const result = await sendFeesBackupEmail({ recipient, schoolId });

    if (!result.ok) {
      return NextResponse.json({ message: result.error || "Failed to send backup email" }, { status: 500 });
    }

    await prisma.backupEmailSchedule.update({
      where: { id: schedule.id },
      data: { lastSentAt: new Date() },
    });

    return NextResponse.json({
      message: "Backup email sent",
      recipient: result.recipient,
      schoolsSent: result.schoolsSent,
      messageId: result.messageId,
    });
  } catch (error: unknown) {
    console.error("Superadmin backup email error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
