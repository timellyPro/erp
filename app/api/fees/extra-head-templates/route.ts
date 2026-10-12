import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { extraHeadTemplatesErrorResponse } from "./mapPrismaError";
import { resolveFeesSchoolIdForSession } from "./resolveSchoolId";
import { invalidateAssignCatalogServerCache } from "@/lib/fees/assignCatalogServerCache";

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

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const templates = await withTenantScopedClient(schoolId, (tx) =>
      tx.extraFeeHeadTemplate.findMany({
        where: { schoolId },
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      })
    );
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
    return await runInTenantScope(schoolId, async (schoolId) => {

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
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
    invalidateAssignCatalogServerCache(schoolId);
    return NextResponse.json({ template: created }, { status: 201 });
    });
  } catch (error: unknown) {
    return extraHeadTemplatesErrorResponse(error, "extra-head-templates POST");
  }
}
