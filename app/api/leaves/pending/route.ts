import { authOptions } from "@/lib/auth/authOptions"
import { withTenantScopedClient } from "@/lib/db/tenantClient"
import { getServerSession } from "next-auth"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.schoolId) {
      return Response.json({ error: "School not found in session" }, { status: 400 })
    }
    const schoolId = session.user.schoolId
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go through
    // the app_tenant connection, restricted by RLS, not just this route's own
    // `where: { schoolId }` filter.
    const leaves = await withTenantScopedClient(schoolId, (tx) =>
      tx.leaveRequest.findMany({
        where: {
          schoolId,
          status: "PENDING"
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      })
    )
    return Response.json(leaves)
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
