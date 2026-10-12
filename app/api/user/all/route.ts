import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role, type Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth/authOptions";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import {
  getUserListCached,
  setUserListCached,
  userListCacheKey,
} from "@/lib/school/userListServerCache";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 10);
    const search = searchParams.get("search") ?? "";
    const role = searchParams.get("role") ?? "";

    const schoolId = session.user.schoolId;
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const cacheKey = userListCacheKey(schoolId, page, pageSize, role, search);
    const cached = getUserListCached<{
      users: unknown[];
      total: number;
      page: number;
      pageSize: number;
    }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const where: Prisma.UserWhereInput = {
      schoolId,
    };

    if (role && Object.values(Role).includes(role as Role)) {
      where.role = role as Role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const [users, total] = await withTenantScopedClient(schoolId, (tx) =>
      Promise.all([
        tx.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            photoUrl: true,
            subject: true,
            allowedFeatures: true,
          },
        }),
        tx.user.count({ where }),
      ])
    );

    const payload = {
      users,
      total,
      page,
      pageSize,
    };
    setUserListCached(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error: unknown) {
    logger.error(error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
