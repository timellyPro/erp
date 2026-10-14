import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { generateSchoolFeesBackupBuffer } from "@/lib/fees/generateSchoolFeesBackupBuffer";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * Download a full fees backup Excel for one school (superadmin only).
 * GET /api/superadmin/schools/[id]/fees-backup
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id: schoolId } = await params;
    const backup = await generateSchoolFeesBackupBuffer(schoolId);
    if (!backup) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    const bytes = new Uint8Array(backup.buffer);
    const filename = backup.filename;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    logger.error("Superadmin school fees backup export error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
