import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.schoolId) {
  return new Response(JSON.stringify({ error: "Unauthorized: No school assigned" }), { status: 401 });
}
const schoolId = session.user.schoolId;
// Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
// through the app_tenant connection, restricted by RLS, not just the
// `where: { schoolId }` filter above.
const leaves = await withTenantScopedClient(schoolId, (tx) =>
  tx.leaveRequest.findMany({
    where: { schoolId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      approver: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })
);

    return new Response(JSON.stringify(leaves), { status: 200 });
  } catch (err: unknown) {
    logger.error("Fetch all leaves error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), { status: 500 });
  }
}
