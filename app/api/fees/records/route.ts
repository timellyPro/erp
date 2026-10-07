import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";
import { roundRupee } from "@/lib/formatRupee";
import { storedDiscountRupeeAmount } from "@/lib/studentFeeHeadDiscount";

/**
 * Fast fee records list for the Fees Records table (no per-head allocation work).
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const takeRaw = Number(searchParams.get("take")) || 5000;
    const take = Math.min(10000, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 5000));
    const cursor = searchParams.get("cursor")?.trim() || null;

    const memKey = `fees:records:v3:${schoolId}:${take}:${cursor ?? "0"}`;
    const cached = getSchoolDashboardServerCached<{ fees: unknown[]; nextCursor: string | null }>(memKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const rows = await prisma.studentFee.findMany({
      where: { student: { schoolId } },
      select: {
        id: true,
        studentId: true,
        totalFee: true,
        finalFee: true,
        amountPaid: true,
        remainingFee: true,
        discountPercent: true,
        student: {
          select: {
            id: true,
            status: true,
            user: { select: { name: true, email: true } },
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { studentId: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { studentId: cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > take;
    const page = hasNext ? rows.slice(0, take) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.studentId ?? null : null;

    const fees = page.map((fee) => {
      const totalFee = roundRupee(fee.totalFee);
      const finalFee = roundRupee(fee.finalFee);
      const amountPaid = roundRupee(fee.amountPaid);
      const remainingFee = Math.max(0, roundRupee(finalFee - amountPaid));
      const discountAmount = storedDiscountRupeeAmount(totalFee, finalFee);
      return {
        id: fee.id,
        studentId: fee.studentId,
        totalFee,
        finalFee,
        amountPaid,
        remainingFee,
        discountPercent: fee.discountPercent,
        discountAmount,
        feeTypes: "-",
        feeTypeDueAmount: remainingFee,
        student: fee.student,
      };
    });

    const payload = { fees, nextCursor };
    setSchoolDashboardServerCached(memKey, payload, 25_000);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Fee records list error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
