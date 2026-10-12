import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "STUDENT" || !session.user.studentId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const studentId = session.user.studentId;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        school: {
          select: {
            id: true,
            billingMode: true,
            parentSubscriptionAmount: true,
            parentSubscriptionTrialDays: true,
            isActive: true,
          },
        },
      },
    });

    if (!student || !student.school) {
      return NextResponse.json({ message: "Student or school not found" }, { status: 404 });
    }

    const defaultAmountEnv = process.env.PARENT_SUBSCRIPTION_AMOUNT_DEFAULT;
    const defaultAmount = defaultAmountEnv ? Number(defaultAmountEnv) || 0 : 0;
    const defaultTrialEnv = process.env.PARENT_SUBSCRIPTION_TRIAL_DAYS_DEFAULT;
    const defaultTrialDays = defaultTrialEnv ? Number(defaultTrialEnv) || 0 : 0;

    if (student.school.isActive === false) {
      return NextResponse.json(
        {
          status: "EXPIRED" as const,
          isTrial: false,
          billingMode: "PARENT_SUBSCRIPTION",
          amount: 0,
          remainingDays: 0,
          expiresAt: null,
          invoiceUrl: null,
          deactivated: true,
          message: "Your school's Timelly access is deactivated. Please contact your school or Timelly support.",
        },
        { status: 200 }
      );
    }

    const billingMode = (student.school.billingMode ?? "PARENT_SUBSCRIPTION") as
      | "PARENT_SUBSCRIPTION"
      | "SCHOOL_PAID";
    const trialDays =
      typeof student.school.parentSubscriptionTrialDays === "number"
        ? student.school.parentSubscriptionTrialDays
        : defaultTrialDays;

    // Default amount shown on UI; can be overridden by ParentSubscription row.
    const defaultAmountForUI =
      typeof student.school.parentSubscriptionAmount === "number"
        ? student.school.parentSubscriptionAmount
        : defaultAmount;

    if (billingMode === "SCHOOL_PAID") {
      // School has already paid centrally – parents don't need to subscribe.
      return NextResponse.json(
        {
          status: "ACTIVE" as const,
          isTrial: false,
          billingMode,
          amount: defaultAmountForUI,
          trialDays,
          remainingDays: null,
          expiresAt: null,
          invoiceUrl: null,
        },
        { status: 200 }
      );
    }

    // Parent-subscription mode: compute based on the actual ParentSubscription record.
    const now = new Date();

    const parentSub = await prisma.parentSubscription.findFirst({
      where: {
        studentId,
        schoolId: student.school.id,
      },
      orderBy: { currentPeriodEnd: "desc" },
    });

    const trialActive =
      !!parentSub?.isTrial &&
      !!parentSub.trialEndsAt &&
      parentSub.trialEndsAt.getTime() > now.getTime();

    const active =
      parentSub?.status === "ACTIVE" &&
      !!parentSub?.currentPeriodEnd &&
      parentSub.currentPeriodEnd.getTime() > now.getTime();

    const isActiveNow = active || trialActive;
    const status = isActiveNow ? ("ACTIVE" as const) : ("EXPIRED" as const);
    const isTrial = trialActive;

    const remainingDays = (() => {
      if (!isActiveNow) return 0;
      const end = isTrial ? parentSub?.trialEndsAt : parentSub?.currentPeriodEnd;
      if (!end) return 0;
      const diffMs = end.getTime() - now.getTime();
      return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    })();

    const amount = typeof parentSub?.amount === "number" && parentSub.amount > 0 ? parentSub.amount : defaultAmountForUI;

    return NextResponse.json(
      {
        status,
        isTrial,
        billingMode,
        amount,
        trialDays,
        remainingDays,
        expiresAt: parentSub?.currentPeriodEnd ? parentSub.currentPeriodEnd.toISOString() : null,
        invoiceUrl: parentSub?.invoiceUrl ?? null,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    logger.error("Parent subscription status error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

