import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "STUDENT" || !session.user.studentId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: {
        studentId: session.user.studentId,
        purpose: "PARENT_SUBSCRIPTION",
        status: "SUCCESS",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        transactionId: true,
      },
    });

    return NextResponse.json(
      {
        payments: payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          createdAt: p.createdAt,
          transactionId: p.transactionId,
        })),
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    logger.error("Parent subscription history error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

