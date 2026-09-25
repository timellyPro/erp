import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";

    if (!schoolId || !name || !email || !password) {
      return NextResponse.json(
        { message: "schoolId, name, email and password are required" },
        { status: 400 }
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email format" }, { status: 400 });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) {
      return NextResponse.json({ message: "School not found" }, { status: 404 });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { message: "User already exists with this email" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const created = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        email: string | null;
        role: string;
        schoolId: string | null;
      }>
    >`
      INSERT INTO "User" (
        id,
        name,
        email,
        password,
        role,
        "schoolId",
        mobile,
        "allowedFeatures",
        "updatedAt"
      )
      VALUES (
        ${userId},
        ${name},
        ${email},
        ${hashedPassword},
        CAST(${"CHAIRMAN"} AS "Role"),
        ${schoolId},
        ${mobile || null},
        ${["FEES"]},
        CURRENT_TIMESTAMP
      )
      RETURNING id, name, email, role::text AS role, "schoolId"
    `;
    const user = created[0];

    return NextResponse.json(
      { message: `Chairman created for ${school.name}`, user },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Superadmin create chairman:", error);
    const err = error as { code?: string; message?: string };
    if (err?.code === "P1001") {
      return NextResponse.json(
        { message: "Database connection failed. Please check Supabase/DATABASE_URL and try again." },
        { status: 503 }
      );
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ message: "A user already exists with this email" }, { status: 400 });
    }
    if (err?.message?.includes("invalid input value for enum")) {
      return NextResponse.json(
        { message: "Database is missing CHAIRMAN role. Run the latest Prisma migration first." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { message: err?.message || "Failed to create chairman" },
      { status: 500 }
    );
  }
}
