import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { extraHeadTemplatesErrorResponse } from "./mapPrismaError";
import { resolveFeesSchoolIdForSession } from "./resolveSchoolId";

function canManage(session: { user?: { role?: string | null } }) {
  const r = String(session.user?.role ?? "");
  return r === "SCHOOLADMIN" || r === "SUPERADMIN" || r === "TEACHER";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const templates = await prisma.extraFeeHeadTemplate.findMany({
      where: { schoolId },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ templates });
  } catch (error: unknown) {
    return extraHeadTemplatesErrorResponse(error, "extra-head-templates GET");
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const amount = Number(body.amount);
    const splitIntoTwoInstallments = Boolean(body.splitIntoTwoInstallments);
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "name (non-empty) and amount (positive number) required" },
        { status: 400 }
      );
    }

    const created = await prisma.extraFeeHeadTemplate.create({
      data: { schoolId, name, amount, splitIntoTwoInstallments },
    });
    return NextResponse.json({ template: created }, { status: 201 });
  } catch (error: unknown) {
    return extraHeadTemplatesErrorResponse(error, "extra-head-templates POST");
  }
}
