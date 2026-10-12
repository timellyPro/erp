import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const schoolsIndex = segments.indexOf("schools");
    const schoolId = schoolsIndex !== -1 ? segments[schoolsIndex + 1] : "";
    if (!schoolId) {
      return NextResponse.json({ message: "School id missing in URL" }, { status: 400 });
    }

    const subscriptionBodySchema = z.object({
      name: z.string().optional(),
      billingMode: z.string().optional(),
      parentSubscriptionAmount: z.union([z.number(), z.null()]).optional(),
      parentSubscriptionTrialDays: z.number().optional(),
      isActive: z.boolean().optional(),
    });
    const parsedBody = subscriptionBodySchema.safeParse(await req.json().catch(() => ({})));
    const body = parsedBody.success ? parsedBody.data : {};

    const data: {
      name?: string;
      billingMode?: string;
      parentSubscriptionAmount?: number | null;
      parentSubscriptionTrialDays?: number;
      isActive?: boolean;
    } = {};

    if (typeof body.name === "string" && body.name.trim() !== "") {
      data.name = body.name.trim();
    }

    if (typeof body.billingMode === "string") {
      data.billingMode =
        body.billingMode === "SCHOOL_PAID" ? "SCHOOL_PAID" : "PARENT_SUBSCRIPTION";
    }

    if (body.parentSubscriptionAmount === null) {
      data.parentSubscriptionAmount = null;
    } else if (typeof body.parentSubscriptionAmount === "number" && !Number.isNaN(body.parentSubscriptionAmount)) {
      data.parentSubscriptionAmount = body.parentSubscriptionAmount;
    }

    if (typeof body.parentSubscriptionTrialDays === "number" && !Number.isNaN(body.parentSubscriptionTrialDays)) {
      data.parentSubscriptionTrialDays = body.parentSubscriptionTrialDays;
    }

    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data,
      select: {
        id: true,
        name: true,
        isActive: true,
        billingMode: true,
        parentSubscriptionAmount: true,
        parentSubscriptionTrialDays: true,
      },
    });

    return NextResponse.json({ school: updated }, { status: 200 });
  } catch (e: unknown) {
    logger.error("Superadmin update school subscription:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

