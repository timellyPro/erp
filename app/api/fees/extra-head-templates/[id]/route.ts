import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { extraHeadTemplatesErrorResponse } from "../mapPrismaError";
import { resolveFeesSchoolIdForSession } from "../resolveSchoolId";
import { invalidateAssignCatalogServerCache } from "@/lib/assignCatalogServerCache";

function canManage(session: { user?: { role?: string | null } }) {
  const r = String(session.user?.role ?? "");
  return r === "SCHOOLADMIN" || r === "SUPERADMIN" || r === "TEACHER";
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const existing = await prisma.extraFeeHeadTemplate.findFirst({
      where: { id, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    const amount =
      body.amount !== undefined && body.amount !== null ? Number(body.amount) : existing.amount;
    const splitIntoTwoInstallments =
      body.splitIntoTwoInstallments !== undefined && body.splitIntoTwoInstallments !== null
        ? Boolean(body.splitIntoTwoInstallments)
        : existing.splitIntoTwoInstallments;
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: "name and positive amount required" }, { status: 400 });
    }

    const updated = await prisma.extraFeeHeadTemplate.update({
      where: { id },
      data: { name, amount, splitIntoTwoInstallments },
    });
    invalidateAssignCatalogServerCache(schoolId);
    return NextResponse.json({ template: updated });
  } catch (error: unknown) {
    return extraHeadTemplatesErrorResponse(error, "extra-head-templates PATCH");
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(session)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  try {
    const schoolId = await resolveFeesSchoolIdForSession(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const deleted = await prisma.extraFeeHeadTemplate.deleteMany({
      where: { id, schoolId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    invalidateAssignCatalogServerCache(schoolId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return extraHeadTemplatesErrorResponse(error, "extra-head-templates DELETE");
  }
}
