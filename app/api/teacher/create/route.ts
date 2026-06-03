import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const { name, email, password, mobile, allowedFeatures } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { message: "Name and password are required" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const features =
      Array.isArray(allowedFeatures) && allowedFeatures.every((f: unknown) => typeof f === "string")
        ? allowedFeatures
        : [];

    const [school, settings] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
      prisma.schoolSettings.findUnique({ where: { schoolId }, select: { emailDomain: true } }),
    ]);
    const schoolDomain =
      normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");

    const emailTrimmed = typeof email === "string" && email.trim() ? email.trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const local = emailLocalPartFromFullName(String(name));
    let userEmail = emailTrimmed && emailRegex.test(emailTrimmed) ? emailTrimmed : `${local}@${schoolDomain}`;
    let counter = 1;
    while (
      await prisma.user.findUnique({
        where: { schoolId_email: { schoolId, email: userEmail } },
        select: { id: true },
      })
    ) {
      userEmail = `${local}.${counter}@${schoolDomain}`;
      counter++;
      if (counter > 1000) {
        return NextResponse.json({ message: "Unable to generate unique email" }, { status: 400 });
      }
    }

    const teacher = await prisma.user.create({
      data: {
        name,
        email: userEmail,
        password: hashedPassword,
        role: Role.TEACHER,
        schoolId,
        mobile: mobile || null,
        allowedFeatures: features,
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        role: true,
      },
    });

    return NextResponse.json(
      { message: "Teacher created successfully", teacher },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create teacher error:", error);

    if (error?.code === "P2002" && error?.meta?.target?.includes("email")) {
      return NextResponse.json(
        { message: "Email already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
