import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const existing = await prisma.pettyCashExpense.findFirst({
      where: { id, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ message: "Expense not found" }, { status: 404 });
    }

    const body = await req.json();
    const itemName = body?.itemName !== undefined ? String(body.itemName).trim() : undefined;
    const amount = body?.amount !== undefined ? Number(body.amount) : undefined;
    const expenseDateRaw = body?.expenseDate !== undefined ? String(body.expenseDate).trim() : undefined;
    const description = body?.description !== undefined ? String(body.description).trim() : undefined;

    const updates: {
      itemName?: string;
      amount?: number;
      expenseDate?: Date;
      description?: string | null;
    } = {};

    if (itemName !== undefined) {
      if (!itemName) {
        return NextResponse.json({ message: "Item name is required" }, { status: 400 });
      }
      updates.itemName = itemName;
    }
    if (amount !== undefined) {
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ message: "Amount must be a positive number" }, { status: 400 });
      }
      updates.amount = amount;
    }
    if (expenseDateRaw !== undefined) {
      if (!expenseDateRaw) {
        return NextResponse.json({ message: "Expense date is required" }, { status: 400 });
      }
      const parsedDate = new Date(expenseDateRaw);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ message: "Invalid expense date" }, { status: 400 });
      }
      updates.expenseDate = parsedDate;
    }
    if (description !== undefined) {
      updates.description = description || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ expense: existing });
    }

    const expense = await prisma.pettyCashExpense.update({
      where: { id },
      data: updates,
    });
    return NextResponse.json({ expense });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Petty cash PATCH error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const existing = await prisma.pettyCashExpense.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Expense not found" }, { status: 404 });
    }

    await prisma.pettyCashExpense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Petty cash DELETE error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
