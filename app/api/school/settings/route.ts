import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const updateSettingsBodySchema = z.object({
  admissionPrefix: z.string().optional(),
  rollNoPrefix: z.string().optional(),
  emailDomain: z.union([z.string(), z.null()]).optional(),
  hyperpgMerchantId: z.union([z.string(), z.null()]).optional(),
  hyperpgApiKey: z.union([z.string(), z.null()]).optional(),
});

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads/writes
    // go through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const settings = await withTenantScopedClient(schoolId, async (tx) => {
      const existing = await tx.schoolSettings.findUnique({ where: { schoolId } });
      if (existing) return existing;
      return tx.schoolSettings.create({
        data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0 },
      });
    });
    return NextResponse.json({ settings }, { status: 200 });
  } catch (e: unknown) {
    logger.error("School settings GET:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const rawBody = await req.json().catch(() => null);
    const parsedBody = updateSettingsBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const {
      admissionPrefix,
      rollNoPrefix,
      emailDomain,
      hyperpgMerchantId,
      hyperpgApiKey,
    } = parsedBody.data;

    const data: {
      admissionPrefix?: string;
      rollNoPrefix?: string;
      emailDomain?: string | null;
      hyperpgMerchantId?: string | null;
      hyperpgApiKey?: string | null;
    } = {};
    if (typeof admissionPrefix === "string") data.admissionPrefix = admissionPrefix;
    if (typeof rollNoPrefix === "string") data.rollNoPrefix = rollNoPrefix;
    if (emailDomain !== undefined) data.emailDomain = emailDomain === "" ? null : String(emailDomain);

    if (hyperpgMerchantId !== undefined) data.hyperpgMerchantId = hyperpgMerchantId === "" ? null : String(hyperpgMerchantId);
    if (hyperpgApiKey !== undefined) data.hyperpgApiKey = hyperpgApiKey === "" ? null : String(hyperpgApiKey);

    const createData = {
      schoolId,
      admissionPrefix: "ADM",
      rollNoPrefix: "",
      admissionCounter: 0,
      ...data,
    };
    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId },
      create: createData,
      update: data,
    });

    return NextResponse.json({ settings }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("School settings PUT:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
