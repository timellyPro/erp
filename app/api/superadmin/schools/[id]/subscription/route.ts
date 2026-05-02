import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { setSchoolHyperpgBaseUrlRaw } from "@/lib/schoolHyperpgBaseUrlRaw";

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

    const body = await req.json().catch(() => ({}));

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

    const hyperpgCredPatch: {
      hyperpgMerchantId?: string | null;
      hyperpgApiKey?: string | null;
    } = {};
    if (body.hyperpgMerchantId !== undefined) {
      hyperpgCredPatch.hyperpgMerchantId =
        body.hyperpgMerchantId === "" || body.hyperpgMerchantId === null
          ? null
          : String(body.hyperpgMerchantId).trim() || null;
    }
    if (body.hyperpgApiKey !== undefined) {
      hyperpgCredPatch.hyperpgApiKey =
        body.hyperpgApiKey === "" || body.hyperpgApiKey === null
          ? null
          : String(body.hyperpgApiKey).trim() || null;
    }

    let hyperpgBaseUrlUpdate: string | null | undefined;
    if (body.hyperpgBaseUrl !== undefined) {
      const u = String(body.hyperpgBaseUrl).trim();
      hyperpgBaseUrlUpdate = u === "" ? null : u.replace(/\/$/, "");
    }

    // Sequential writes (no interactive `$transaction`) — avoids P2028 with Supabase
    // pooler / PgBouncer when interactive transactions cannot start in time.
    let updated =
      Object.keys(data).length > 0
        ? await prisma.school.update({
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
          })
        : await prisma.school.findUniqueOrThrow({
            where: { id: schoolId },
            select: {
              id: true,
              name: true,
              isActive: true,
              billingMode: true,
              parentSubscriptionAmount: true,
              parentSubscriptionTrialDays: true,
            },
          });

    const credKeys = Object.keys(hyperpgCredPatch);
    if (credKeys.length > 0) {
      await prisma.schoolSettings.upsert({
        where: { schoolId },
        create: {
          schoolId,
          admissionPrefix: "ADM",
          rollNoPrefix: "",
          admissionCounter: 0,
          ...hyperpgCredPatch,
        },
        update: hyperpgCredPatch,
      });
    } else if (hyperpgBaseUrlUpdate !== undefined) {
      await prisma.schoolSettings.upsert({
        where: { schoolId },
        create: {
          schoolId,
          admissionPrefix: "ADM",
          rollNoPrefix: "",
          admissionCounter: 0,
        },
        update: {},
      });
    }

    if (hyperpgBaseUrlUpdate !== undefined) {
      await setSchoolHyperpgBaseUrlRaw(schoolId, hyperpgBaseUrlUpdate);
    }

    return NextResponse.json({ school: updated }, { status: 200 });
  } catch (e: unknown) {
    console.error("Superadmin update school subscription:", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return NextResponse.json(
        {
          message:
            "Database connection timed out. Try again in a moment. If this keeps happening, avoid long-lived transactions or check your Postgres pooler (e.g. Supabase) settings.",
        },
        { status: 503 }
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
      const msg = e.message || "";
      if (msg.includes("hyperpgBaseUrl")) {
        return NextResponse.json(
          {
            message:
              "Database is missing optional column hyperpgBaseUrl on SchoolSettings. Run: ALTER TABLE \"SchoolSettings\" ADD COLUMN IF NOT EXISTS \"hyperpgBaseUrl\" TEXT; or run pending Prisma migrations, then restart the app.",
          },
          { status: 503 }
        );
      }
    }
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

