import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getSchoolHyperpgPaymentRowRaw } from "@/lib/schoolHyperpgBaseUrlRaw";

/**
 * GET /api/superadmin/schools/:id/settings
 * Payment gateway fields for a school (sensitive — superadmin only).
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
    if (!schoolId) {
      return NextResponse.json({ message: "School id missing" }, { status: 400 });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    // Raw SQL: avoids Prisma+Redis caching returning an outdated SchoolSettings row
    // (so merchant id / API key always match the database when opening Edit subscription).
    let row = await getSchoolHyperpgPaymentRowRaw(schoolId);

    if (!row) {
      await prisma.schoolSettings.create({
        data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0 },
      });
      row = await getSchoolHyperpgPaymentRowRaw(schoolId);
    }

    const settings = {
      hyperpgBaseUrl: row?.hyperpgBaseUrl ?? null,
      hyperpgMerchantId: row?.hyperpgMerchantId ?? null,
      hyperpgApiKey: row?.hyperpgApiKey ?? null,
    };

    return NextResponse.json(
      { settings },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch (e: unknown) {
    console.error("Superadmin school settings GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
