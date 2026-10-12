import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/payment/receipt?order_id=xxx
 * Returns payment status and receipt details for the given order_id.
 * Caller must be the student who made the payment (session.studentId).
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json(
      { message: "Only students can view payment receipts" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id")?.trim();

  if (!orderId) {
    return NextResponse.json(
      { message: "Missing order_id" },
      { status: 400 }
    );
  }

  try {
    const studentId = session.user.studentId;

    const payment = await prisma.payment.findFirst({
      where: {
        studentId,
        OR: [
          { transactionId: orderId },
          { hyperpgOrderId: orderId },
        ],
      },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            fatherName: true,
            user: { select: { name: true, email: true } },
            class: { select: { name: true, section: true } },
            school: { select: { name: true } },
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { message: "Payment not found for this order" },
        { status: 404 }
      );
    }

    const receipt = {
      paymentId: payment.id,
      orderId: payment.transactionId || orderId,
      transactionId: payment.hyperpgTxnId || payment.transactionId || payment.id,
      amount: payment.amount,
      currency: "INR",
      status: payment.status,
      gateway: payment.gateway,
      gatewayStatus: payment.hyperpgStatus || null,
      gatewayStatusId: typeof payment.hyperpgStatusId === "number" ? payment.hyperpgStatusId : null,
      refunded: typeof payment.hyperpgRefunded === "boolean" ? payment.hyperpgRefunded : null,
      amountRefunded: typeof payment.hyperpgAmountRefunded === "number" ? payment.hyperpgAmountRefunded : null,
      createdAt: payment.createdAt,
      student: payment.student
        ? {
            name: payment.student.user?.name || payment.student.fatherName,
            admissionNumber: payment.student.admissionNumber,
            class: payment.student.class
              ? `${payment.student.class.name}${payment.student.class.section ? ` - ${payment.student.class.section}` : ""}`
              : null,
            school: payment.student.school?.name ?? null,
          }
        : null,
    };

    return NextResponse.json({ receipt });
  } catch (error) {
    logger.error("Payment receipt error:", error);
    return NextResponse.json(
      { message: "Failed to fetch receipt" },
      { status: 500 }
    );
  }
}
