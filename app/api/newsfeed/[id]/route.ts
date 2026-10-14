import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

async function verifyAndGetFeed(id: string, schoolId: string) {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "NewsFeed" WHERE id = $1 AND "schoolId" = $2`,
    id,
    schoolId
  );
  return rows[0] ?? null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const photo = typeof body.photo === "string" ? body.photo : typeof body.mediaUrl === "string" ? body.mediaUrl : undefined;

    const schoolId = session.user.schoolId as string | undefined;
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    const exists = await runInTenantScope(schoolId, () => verifyAndGetFeed(id, schoolId));
    if (!exists) {
      return NextResponse.json(
        { message: "News feed not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    try {
      const updated = await runInTenantScope(schoolId, () => prisma.newsFeed.update({
        where: { id },
        data: {
          ...(title != null && title !== "" && { title }),
          ...(description != null && description !== "" && { description }),
          ...(photo !== undefined && { photo: photo || null }),
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }));
      return NextResponse.json(
        { message: "News feed updated successfully", newsFeed: updated },
        { status: 200 }
      );
    } catch (prismaError: unknown) {
      // Fallback: raw SQL update (Prisma delegate can lag behind migrations).
      // Log first — otherwise a real error (bad data, constraint violation) gets
      // silently masked by the raw-SQL retry instead of surfacing.
      logger.error("newsFeed.update failed, falling back to raw SQL:", prismaError);
      const parts: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (title != null && title !== "") {
        parts.push(`title = $${idx++}`);
        values.push(title);
      }
      if (description != null && description !== "") {
        parts.push(`description = $${idx++}`);
        values.push(description);
      }
      if (photo !== undefined) {
        parts.push(`photo = $${idx++}`);
        values.push(photo || null);
      }
      if (parts.length === 0) {
        return NextResponse.json({ message: "News feed updated successfully", newsFeed: {} }, { status: 200 });
      }
      values.push(id, schoolId);
      await runInTenantScope(schoolId, () => prisma.$executeRawUnsafe(
        `UPDATE "NewsFeed" SET ${parts.join(", ")}, "updatedAt" = NOW() WHERE id = $${idx} AND "schoolId" = $${idx + 1}`,
        ...values
      ));
      return NextResponse.json(
        { message: "News feed updated successfully", newsFeed: {} },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    logger.error("Update news feed error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const schoolId = session.user.schoolId as string | undefined;
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    const exists = await runInTenantScope(schoolId, () => verifyAndGetFeed(id, schoolId));
    if (!exists) {
      return NextResponse.json(
        { message: "News feed not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    try {
      await runInTenantScope(schoolId, () => prisma.newsFeed.delete({ where: { id } }));
    } catch (prismaError: unknown) {
      logger.error("newsFeed.delete failed, falling back to raw SQL:", prismaError);
      await runInTenantScope(schoolId, () => prisma.$executeRawUnsafe(
        `DELETE FROM "NewsFeed" WHERE id = $1 AND "schoolId" = $2`,
        id,
        schoolId
      ));
    }
    return NextResponse.json({ message: "News feed deleted successfully" }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Delete news feed error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
