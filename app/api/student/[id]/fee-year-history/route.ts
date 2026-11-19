import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { schoolIdViaAdminRelation } from "@/lib/auth/tenant";
import { computeAdminStudentFeeBreakdown } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { grossTotalFromBreakdown, netTotalFromBreakdown } from "@/lib/fees/feeBreakdownTotals";
import { academicYearStartYearFromYmd, kolkataYmd } from "@/lib/fees/residencyConversion";
import { roundRupee } from "@/lib/formatRupee";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

type RouteParams = { params: Promise<{ id: string }> };

async function authorize(requireAdmin: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature =
    session.user.role === "TEACHER" &&
    (session.user.allowedFeatures?.includes("STUDENTS") ||
      session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  if (!isAdmin && (requireAdmin || !hasFeature)) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  const schoolId = session.user.schoolId ?? (await schoolIdViaAdminRelation(session.user.id));
  if (!schoolId) return { error: NextResponse.json({ message: "School not found" }, { status: 400 }) };
  return { schoolId };
}

/** Saved year-wise fee rows for one student, newest year first. The current year is computed live by the client. */
export async function GET(_req: Request, context: RouteParams) {
  const { id } = await context.params;
  const auth = await authorize(false);
  if ("error" in auth && auth.error) return auth.error;
  const schoolId = auth.schoolId as string;
  try {
    const rows = await runInTenantScope(schoolId, async () => {
      const student = await prisma.student.findFirst({ where: { id, schoolId }, select: { id: true } });
      if (!student) return null;
      return prisma.studentFeeYearHistory.findMany({
        where: { studentId: id, schoolId },
        orderBy: { academicYearStartYear: "desc" },
      });
    });
    if (!rows) return NextResponse.json({ message: "Student not found" }, { status: 404 });
    return NextResponse.json(
      {
        currentAcademicYearStartYear: academicYearStartYearFromYmd(kolkataYmd()),
        years: rows.map((r) => ({
          academicYearStartYear: r.academicYearStartYear,
          totalFee: r.totalFee,
          concession: r.concession,
          finalFee: r.finalFee,
          amountPaid: r.amountPaid,
          balance: r.balance,
        })),
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error: unknown) {
    logger.error("Fee year history GET error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}

/**
 * Save (or refresh) the summary row for the current academic year, computed on the server from the live
 * fee breakdown. Nothing in the request body is trusted.
 */
export async function POST(_req: Request, context: RouteParams) {
  const { id } = await context.params;
  const auth = await authorize(true);
  if ("error" in auth && auth.error) return auth.error;
  const schoolId = auth.schoolId as string;
  try {
    const year = academicYearStartYearFromYmd(kolkataYmd());
    const saved = await runInTenantScope(schoolId, async () => {
      const student = await prisma.student.findFirst({ where: { id, schoolId }, select: { id: true } });
      if (!student) return null;
      const breakdown = await computeAdminStudentFeeBreakdown(schoolId, id, {
        migrateLumps: false,
        cleanupHostelMessDuplicates: false,
      });
      const net = netTotalFromBreakdown(breakdown) ?? 0;
      const gross = grossTotalFromBreakdown(breakdown) ?? net;
      const paid = roundRupee(Number(breakdown?.amountPaid) || 0);
      const data = {
        totalFee: gross,
        concession: roundRupee(Math.max(gross - net, 0)),
        finalFee: net,
        amountPaid: paid,
        balance: roundRupee(Math.max(Number(breakdown?.remainingFee) || 0, 0)),
      };
      return prisma.studentFeeYearHistory.upsert({
        where: { studentId_academicYearStartYear: { studentId: id, academicYearStartYear: year } },
        create: { studentId: id, schoolId, academicYearStartYear: year, ...data },
        update: data,
      });
    });
    if (!saved) return NextResponse.json({ message: "Student not found" }, { status: 404 });
    return NextResponse.json({ saved: true, academicYearStartYear: year }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Fee year history POST error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
