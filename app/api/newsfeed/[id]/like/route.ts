import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import { invalidateParentPortalCaches } from "@/lib/parent/invalidateParentPortalCaches";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    return await runInOptionalTenantScope(session?.user?.schoolId, async () => {
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id: newsFeedId } = await params;
    const userId = session.user.id;

    const feed = await prisma.newsFeed.findUnique({
      where: { id: newsFeedId },
      select: { id: true },
    });

    if (!feed) {
      return NextResponse.json({ message: "News feed not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingLike = await tx.newsFeedLike.findUnique({
        where: { userId_newsFeedId: { userId, newsFeedId } },
        select: { id: true },
      });

      if (existingLike) {
        await tx.newsFeedLike.delete({
          where: { userId_newsFeedId: { userId, newsFeedId } },
        });

        const updatedFeed = await tx.newsFeed.update({
          where: { id: newsFeedId },
          data: { likes: { decrement: 1 } },
          select: { likes: true },
        });

        return {
          liked: false,
          likes: Math.max(0, updatedFeed.likes ?? 0),
        };
      }

      await tx.newsFeedLike.create({
        data: { userId, newsFeedId },
      });

      const updatedFeed = await tx.newsFeed.update({
        where: { id: newsFeedId },
        data: { likes: { increment: 1 } },
        select: { likes: true },
      });

      return {
        liked: true,
        likes: updatedFeed.likes ?? 0,
      };
    });

    if (session.user.studentId) {
      const st = await prisma.student.findUnique({
        where: { id: session.user.studentId },
        select: { schoolId: true },
      });
      if (st?.schoolId) {
        invalidateParentPortalCaches({
          schoolId: st.schoolId,
          studentId: session.user.studentId,
        });
      }
    }

    return NextResponse.json(result, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("News feed like error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
