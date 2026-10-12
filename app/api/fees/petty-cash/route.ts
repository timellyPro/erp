import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { logger } from "@/lib/logger";

async function createPettyCashExpenseWithAutoVoucher(
  schoolId: string,
  payload: {
    itemName: string;
    headOfAccount: string;
    paymentType: "CASH" | "ONLINE";
    amount: number;
    expenseDate: Date;
    description: string | null;
  }
) {
  const maxRetries = 4;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const last = await prisma.pettyCashExpense.findFirst({
        where: { schoolId },
        orderBy: { voucherNo: "desc" },
        select: { voucherNo: true },
      });
      const nextVoucherNo = (last?.voucherNo ?? 0) + 1;
      return await prisma.pettyCashExpense.create({
        data: {
          schoolId,
          voucherNo: nextVoucherNo,
          itemName: payload.itemName,
          headOfAccount: payload.headOfAccount,
          paymentType: payload.paymentType,
          amount: payload.amount,
          expenseDate: payload.expenseDate,
          description: payload.description,
        },
      });
    } catch (error: unknown) {
      // Retry if voucher number was taken by another concurrent request.
      const maybePrismaError = error as { code?: string };
      if (maybePrismaError?.code === "P2002" && attempt < maxRetries - 1) {
        continue;
      }
      if (maybePrismaError?.code === "P2028" && attempt < maxRetries - 1) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to generate voucher number");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const expenses = await withTenantScopedClient(schoolId, (tx) =>
      tx.pettyCashExpense.findMany({
        where: { schoolId },
        orderBy: [{ expenseDate: "desc" }, { voucherNo: "desc" }],
      })
    );
    return NextResponse.json({ expenses });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error("Petty cash GET error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    const itemName = String(body?.itemName ?? "").trim();
    const headOfAccount = String(body?.headOfAccount ?? "").trim();
    const paymentTypeRaw = String(body?.paymentType ?? "").trim().toUpperCase();
    const amount = Number(body?.amount);
    const expenseDateRaw = String(body?.expenseDate ?? "").trim();
    const descriptionRaw = String(body?.description ?? "").trim();

    if (!headOfAccount) {
      return NextResponse.json({ message: "Head of account is required" }, { status: 400 });
    }
    const paymentType = paymentTypeRaw === "ONLINE" ? "ONLINE" : paymentTypeRaw === "CASH" ? "CASH" : null;
    if (!paymentType) {
      return NextResponse.json({ message: "Payment type must be Cash or Online" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: "Amount must be a positive number" }, { status: 400 });
    }
    if (!expenseDateRaw) {
      return NextResponse.json({ message: "Expense date is required" }, { status: 400 });
    }

    const expenseDate = new Date(expenseDateRaw);
    if (Number.isNaN(expenseDate.getTime())) {
      return NextResponse.json({ message: "Invalid expense date" }, { status: 400 });
    }
    if (descriptionRaw.length > 1000) {
      return NextResponse.json({ message: "Description must be 500 characters or less" }, { status: 400 });
    }

    const expense = await createPettyCashExpenseWithAutoVoucher(schoolId, {
      itemName: itemName || headOfAccount,
      headOfAccount,
      paymentType,
      amount,
      expenseDate,
      description: descriptionRaw || null,
    });

    return NextResponse.json({ expense }, { status: 201 });
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error("Petty cash POST error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
