import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * Single API: create school + school admin user and link them (user.schoolId = school.id).
 * POST /api/superadmin/schools/create
 * Body: { schoolName, email, password, address?, location?, phone? }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    const billingModeRaw = typeof body.billingMode === "string" ? body.billingMode.trim() : "";
    const parentSubscriptionAmount =
      typeof body.parentSubscriptionAmount === "number" && !Number.isNaN(body.parentSubscriptionAmount)
        ? body.parentSubscriptionAmount
        : undefined;
    const parentSubscriptionTrialDays =
      typeof body.parentSubscriptionTrialDays === "number" && !Number.isNaN(body.parentSubscriptionTrialDays)
        ? body.parentSubscriptionTrialDays
        : undefined;

    if (!schoolName || !email || !password) {
      return NextResponse.json(
        { message: "schoolName, email and password are required" },
        { status: 400 }
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email format" }, { status: 400 });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json({ message: "User already exists with this email" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: schoolName,
          email,
          password: hashedPassword,
          role: "SCHOOLADMIN",
          allowedFeatures: [],
          mobile: phone || null,
        },
        select: { id: true, name: true, email: true, role: true },
      });

      const school = await tx.school.create({
        data: {
          name: schoolName,
          address: address || schoolName,
          location: location || "",
          admins: { connect: { id: user.id } },
          billingMode: billingModeRaw === "SCHOOL_PAID" ? "SCHOOL_PAID" : "PARENT_SUBSCRIPTION",
          parentSubscriptionAmount: parentSubscriptionAmount,
          parentSubscriptionTrialDays: parentSubscriptionTrialDays ?? 0,
        },
        select: {
          id: true,
          name: true,
          address: true,
          location: true,
          billingMode: true,
          parentSubscriptionAmount: true,
          parentSubscriptionTrialDays: true,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { schoolId: school.id },
      });

      return { user, school };
    });

    return NextResponse.json(
      { message: "School and admin created", user: result.user, school: result.school },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error("Superadmin create school:", e);
    const err = e as { code?: string; name?: string; cause?: unknown };
    if (err?.code === "P2002") {
      return NextResponse.json({ message: "Email already exists" }, { status: 400 });
    }
    const msg =
      err?.name === "DriverAdapterError" ||
      (e instanceof Error && (e.message.includes("statement timeout") || e.message.includes("Connection terminated")))
        ? "Database request timed out. Ensure DIRECT_URL is set in .env (Supabase direct connection) to avoid pooler timeout."
        : e instanceof Error
          ? e.message
          : "Internal server error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
