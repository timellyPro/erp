import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

/**
 * Set school active/deactive. When deactive, the school is paused (all working tabs blocked).
 * PATCH /api/superadmin/schools/[id]/active
 * Body: { isActive: boolean }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const parsedBody = z.object({ isActive: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
    if (isActive === undefined) {
      return NextResponse.json({ message: "isActive (boolean) is required" }, { status: 400 });
    }

    const existing = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    const updated = await prisma.school.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });

    return NextResponse.json({ school: updated }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Superadmin school active PATCH:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e) },
      { status: 500 }
    );
  }
}
