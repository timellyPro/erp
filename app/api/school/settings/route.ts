import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const settings = await prisma.schoolSettings.findUnique({
      where: { schoolId },
    });

    if (!settings) {
      const created = await prisma.schoolSettings.create({
        data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0, defaultInstallments: 3 },
      });
      return NextResponse.json({ settings: created }, { status: 200 });
    }
    return NextResponse.json({ settings }, { status: 200 });
  } catch (e: unknown) {
    console.error("School settings GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const schoolId = await getSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const body = await req.json();
    const {
      admissionPrefix,
      rollNoPrefix,
      emailDomain,
      defaultInstallments,

      hyperpgMerchantId,
      hyperpgApiKey,
    } = body;

    const data: {
      admissionPrefix?: string;
      rollNoPrefix?: string;
      emailDomain?: string | null;
      juspayMerchantId?: string | null;
      juspayApiKey?: string | null;
      hyperpgMerchantId?: string | null;
      hyperpgApiKey?: string | null;
      defaultInstallments?: number;
    } = {};
    if (typeof admissionPrefix === "string") data.admissionPrefix = admissionPrefix;
    if (typeof rollNoPrefix === "string") data.rollNoPrefix = rollNoPrefix;
    if (emailDomain !== undefined) data.emailDomain = emailDomain === "" ? null : String(emailDomain);
    if (defaultInstallments !== undefined) {
      const n = Number(defaultInstallments);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ message: "defaultInstallments must be a positive integer" }, { status: 400 });
      }
      data.defaultInstallments = n;
    }

    if (hyperpgMerchantId !== undefined) data.hyperpgMerchantId = hyperpgMerchantId === "" ? null : String(hyperpgMerchantId);
    if (hyperpgApiKey !== undefined) data.hyperpgApiKey = hyperpgApiKey === "" ? null : String(hyperpgApiKey);

    const createData = {
      schoolId,
      admissionPrefix: "ADM",
      rollNoPrefix: "",
      admissionCounter: 0,
      defaultInstallments: 3,
      ...data,
    };
    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId },
      create: createData,
      update: data,
    });

    if (typeof data.defaultInstallments === "number") {
      await prisma.studentFee.updateMany({
        where: { student: { schoolId } },
        data: { installments: data.defaultInstallments },
      });
    }
    return NextResponse.json({ settings }, { status: 200 });
  } catch (e: unknown) {
    console.error("School settings PUT:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
