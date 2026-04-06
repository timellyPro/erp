import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

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

/**
 * GET /api/fees/transactions
 * List successful payments for school admin. Optional: ?studentId=xxx
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature = session.user.role === "TEACHER" && (session.user.allowedFeatures?.includes("FEES") || session.user.allowedFeatures?.includes("PAYMENTS"));
  if (!isAdmin && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId")?.trim() || undefined;
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);

    const where: {
      student: { schoolId: string; id?: string };
      status: string;
      eventRegistrationId: null;
    } = {
      student: { schoolId },
      status: "SUCCESS",
      eventRegistrationId: null,
    };
    if (studentId) {
      where.student.id = studentId;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            user: { select: { name: true, email: true } },
            class: { select: { name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const paymentIds = payments.map((p) => p.id);
    let refundSums: { paymentId: string; total: number }[] = [];
    if (paymentIds.length > 0) {
      const placeholders = paymentIds.map((_, i) => `$${i + 1}`).join(", ");
      refundSums = (await prisma.$queryRawUnsafe(
        `SELECT "paymentId", SUM(amount)::float as total FROM "Refund" WHERE "paymentId" IN (${placeholders}) AND status = 'SUCCESS' GROUP BY "paymentId"`,
        ...paymentIds
      )) as { paymentId: string; total: number }[];
    }

    const refundByPayment = new Map(refundSums.map((r) => [r.paymentId, r.total]));

    const transactions = payments.map((p) => {
      const refunded = refundByPayment.get(p.id) ?? 0;
      const refundable = Math.max(p.amount - refunded, 0);
      return {
        id: p.id,
        amount: p.amount,
        gateway: p.gateway,
        status: p.status,
        hyperpgStatus: p.hyperpgStatus ?? null,
        hyperpgStatusId: typeof p.hyperpgStatusId === "number" ? p.hyperpgStatusId : null,
        hyperpgTxnId: p.hyperpgTxnId ?? null,
        hyperpgRefunded: p.hyperpgRefunded ?? null,
        hyperpgAmountRefunded: typeof p.hyperpgAmountRefunded === "number" ? p.hyperpgAmountRefunded : null,
        transactionId: p.transactionId,
        createdAt: p.createdAt,
        student: p.student,
        refunded,
        refundable,
        refunds: [] as { id: string; amount: number; createdAt: Date }[],
      };
    });

    return NextResponse.json({ transactions }, { status: 200 });
  } catch (error: unknown) {
    console.error("Transactions error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
