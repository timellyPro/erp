import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  buildSchoolFeesBackupWorkbook,
  schoolFeesBackupFilename,
} from "@/lib/buildSchoolFeesBackupWorkbook";
import { loadSchoolFeesBackupData } from "@/lib/loadSchoolFeesBackupData";

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
    const data = await loadSchoolFeesBackupData(schoolId);
    if (!data) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    const workbook = await buildSchoolFeesBackupWorkbook(data);
    const buf = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer));
    const filename = schoolFeesBackupFilename(data.school.name);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Superadmin school fees backup export error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
