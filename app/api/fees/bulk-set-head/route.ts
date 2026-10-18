import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { auditActorFromSession } from "@/lib/fees/paymentAudit";
import {
  applyBulkSetFeeHead,
  BulkEditConflictError,
  planBulkSetFeeHead,
  validateBulkInput,
} from "@/lib/fees/bulkSetFeeHead";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export const maxDuration = 60;

const bodySchema = z.object({
  mode: z.enum(["preview", "apply"]),
  headName: z.string(),
  amount: z.number(),
  studentIds: z.array(z.string()).max(1000),
  /** Required to apply: how many students the admin saw would change on the preview. */
  confirmCount: z.number().int().min(0).optional(),
});

async function adminSchoolId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) } as const;
  if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "SUPERADMIN") {
    return { error: NextResponse.json({ message: "Only a school admin can bulk edit fees" }, { status: 403 }) } as const;
  }
  const schoolId = await resolveFeesSchoolId(session);
  if (!schoolId) return { error: NextResponse.json({ message: "School not found" }, { status: 400 }) } as const;
  return { session, schoolId } as const;
}

/** POST: preview or apply "set this fee head to this amount" for the chosen students. */
export async function POST(req: Request) {
  try {
    const auth = await adminSchoolId();
    if ("error" in auth) return auth.error;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    const body = parsed.data;
    const invalid = validateBulkInput(body.headName, body.amount, body.studentIds);
    if (invalid) return NextResponse.json({ message: invalid }, { status: 400 });

    return await runInTenantScope(auth.schoolId, async (schoolId) => {
      if (body.mode === "preview") {
        return NextResponse.json({ plan: await planBulkSetFeeHead(schoolId, body) });
      }
      if (body.confirmCount === undefined) {
        return NextResponse.json({ message: "Preview first, then confirm the number of students." }, { status: 400 });
      }
      const result = await applyBulkSetFeeHead(schoolId, {
        ...body,
        confirmCount: body.confirmCount,
        actor: auditActorFromSession(auth.session),
      });
      return NextResponse.json(result, { status: 201 });
    });
  } catch (error: unknown) {
    if (error instanceof BulkEditConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    logger.error("bulk-set-head error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}

/** GET: recent bulk edits, newest first. */
export async function GET() {
  try {
    const auth = await adminSchoolId();
    if ("error" in auth) return auth.error;
    return await runInTenantScope(auth.schoolId, async (schoolId) => {
      const edits = await prisma.feeBulkEdit.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          headName: true,
          amount: true,
          status: true,
          actorName: true,
          studentCount: true,
          totalDelta: true,
          createdAt: true,
          undoneAt: true,
          undoneByName: true,
        },
      });
      return NextResponse.json({ edits });
    });
  } catch (error: unknown) {
    logger.error("bulk-set-head list error:", error);
    return NextResponse.json({ message: toClientErrorMessage(error, "Internal server error") }, { status: 500 });
  }
}
