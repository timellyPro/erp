import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { activeStudentWhere } from "@/lib/students/studentStatus";
import { isStudentHosteller } from "@/lib/fees/extraFeeResidencyScope";
import { BULK_MAX_STUDENTS } from "@/lib/fees/bulkSetFeeHead";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * GET /api/fees/bulk-set-head/students?classId=&section=&residency=HOSTELLER|DAY_SCHOLAR
 * Active students of the school for the bulk fee editor's picker.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Only a school admin can bulk edit fees" }, { status: 403 });
    }
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() || "";
    const section = searchParams.get("section")?.trim() || "";
    const residency = searchParams.get("residency")?.trim().toUpperCase() || "";

    return await runInTenantScope(schoolId, async (schoolId) => {
      const rows = await prisma.student.findMany({
        where: {
          schoolId,
          ...activeStudentWhere,
          ...(classId ? { classId } : {}),
          ...(section ? { class: { section } } : {}),
        },
        take: 3000,
        select: {
          id: true,
          admissionNumber: true,
          residencyType: true,
          user: { select: { name: true } },
          class: { select: { name: true, section: true } },
        },
        orderBy: [{ class: { name: "asc" } }, { admissionNumber: "asc" }],
      });
      const students = rows
        .filter((s) => {
          if (residency === "HOSTELLER") return isStudentHosteller(s.residencyType);
          if (residency === "DAY_SCHOLAR") return !isStudentHosteller(s.residencyType);
          return true;
        })
        .map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          name: s.user?.name ?? "",
          className: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "",
          residency: isStudentHosteller(s.residencyType) ? "Hosteller" : "Day Scholar",
        }));
      return NextResponse.json({ students, max: BULK_MAX_STUDENTS });
    });
  } catch (error: unknown) {
    logger.error("bulk-set-head students error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
