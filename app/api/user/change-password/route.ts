import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    return await runInOptionalTenantScope(session?.user?.schoolId, async () => {
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsedBody = changePasswordBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "currentPassword and newPassword are required" },
        { status: 400 }
      );
    }
    const { currentPassword, newPassword } = parsedBody.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const ok = await bcrypt.compare(String(currentPassword), user.password);
    if (!ok) {
      return NextResponse.json({ message: "Current password is incorrect" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return NextResponse.json({ message: "Password updated" }, { status: 200 });
    });
  } catch (e: unknown) {
    logger.error("User change-password POST:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

