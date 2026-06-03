import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

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
    const studentId = searchParams.get("studentId")?.trim() || undefined;
    const rawLimit = Number(searchParams.get("limit")) || 100;
    const forFeeReport = searchParams.get("forFeeReport") === "1";
    /** Fee-report exports need a high cap; default list views stay small. */
    const limit = Math.min(Math.max(rawLimit, 1), forFeeReport ? 25000 : 200);

    if (!forFeeReport && !studentId) {
      const memKey = `fees:transactions:${schoolId}:${limit}`;
      const cached = getSchoolDashboardServerCached<{ transactions: unknown[] }>(memKey);
      if (cached && Array.isArray(cached.transactions) && cached.transactions.length > 0) {
        return NextResponse.json(cached, { status: 200 });
      }
    }

    const where: {
      student: { schoolId: string; id?: string };
      status: { in: string[] };
      purpose: string;
    } = {
      student: { schoolId },
      status: { in: ["SUCCESS", "COMPLETED"] },
      purpose: "FEES",
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
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const paymentIds = payments.map((p) => p.id);
    const paymentAllocations =
      paymentIds.length > 0
        ? await prisma.paymentFeeAllocation.findMany({
            where: {
              paymentId: { in: paymentIds },
              allocationType: "PAYMENT",
            },
            select: {
              paymentId: true,
              headType: true,
              componentIndex: true,
              componentName: true,
              extraFeeId: true,
              allocatedAmount: true,
            },
          })
        : [];
    const extraFeeIds = Array.from(
      new Set(
        paymentAllocations
          .filter((a) => a.headType === "EXTRA_FEE" && !!a.extraFeeId)
          .map((a) => a.extraFeeId as string)
      )
    );
    const extraFees =
      extraFeeIds.length > 0
        ? await prisma.extraFee.findMany({
            where: { id: { in: extraFeeIds } },
            select: { id: true, name: true },
          })
        : [];
    const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

    const allocationLabelAmountByPayment = new Map<string, Map<string, number>>();
    for (const a of paymentAllocations) {
      if (a.allocatedAmount <= 0.00001) continue;
      let label = "Default";
      if (a.headType === "BASE_COMPONENT") {
        label = a.componentName || (typeof a.componentIndex === "number" ? `Component ${a.componentIndex + 1}` : "School Fees");
      } else if (a.headType === "EXTRA_FEE") {
        label = a.extraFeeId ? extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee" : "Extra Fee";
      }
      const perPayment = allocationLabelAmountByPayment.get(a.paymentId) ?? new Map<string, number>();
      allocationLabelAmountByPayment.set(a.paymentId, perPayment);
      perPayment.set(label, (perPayment.get(label) ?? 0) + a.allocatedAmount);
    }

    const dominantFeeTypeByPayment = new Map<string, { name: string; amount: number }>();
    for (const [paymentId, labelMap] of allocationLabelAmountByPayment.entries()) {
      let bestName = "Default";
      let bestAmount = 0;
      for (const [name, amt] of labelMap.entries()) {
        if (amt > bestAmount) {
          bestAmount = amt;
          bestName = name;
        }
      }
      dominantFeeTypeByPayment.set(paymentId, { name: bestName, amount: bestAmount });
    }

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
      const perHead = allocationLabelAmountByPayment.get(p.id);
      const feeAllocations = perHead
        ? Array.from(perHead.entries()).map(([name, amount]) => ({
            name,
            amount,
          }))
        : [];
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
        feeTypeName: dominantFeeTypeByPayment.get(p.id)?.name ?? "Default",
        feeTypeAmount: dominantFeeTypeByPayment.get(p.id)?.amount ?? p.amount,
        feeAllocations,
        student: p.student,
        refunded,
        refundable,
        refunds: [] as { id: string; amount: number; createdAt: Date }[],
      };
    });

    const payload = { transactions };
    if (!forFeeReport && !studentId && transactions.length > 0) {
      setSchoolDashboardServerCached(`fees:transactions:${schoolId}:${limit}`, payload, 20_000);
    }
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Transactions error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
