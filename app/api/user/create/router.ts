import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/authOptions";
import prisma from "../../../../lib/db";
import bcrypt from "bcryptjs";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }


    // Check if user has permission to create users
    const requesterRole = session.user.role as string;
    const isAdmin = ["SCHOOLADMIN", "SUPERADMIN"].includes(requesterRole);
    const isTeacher = requesterRole === "TEACHER";

    if (!isAdmin && !isTeacher) {
      return NextResponse.json(
        { message: "You do not have permission to create users" },
        { status: 403 }
      );
    }

    const { name, email, role, designation, password, allowedFeatures } =
      await req.json();

    // Validation
    if (!name || !role || !password) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const [school, settings] = await Promise.all([
      prisma.school.findUnique({ where: { id: session.user.schoolId as string }, select: { name: true } }),
      prisma.schoolSettings.findUnique({ where: { schoolId: session.user.schoolId as string }, select: { emailDomain: true } }),
    ]);
    const schoolDomain =
      normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");
    const emailTrimmed = typeof email === "string" && email.trim() ? email.trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const local = emailLocalPartFromFullName(String(name));
    let finalEmail = emailTrimmed && emailRegex.test(emailTrimmed) ? emailTrimmed : `${local}@${schoolDomain}`;
    let counter = 1;
    const createSchoolId = session.user.schoolId as string;
    while (
      await prisma.user.findUnique({
        where: { schoolId_email: { schoolId: createSchoolId, email: finalEmail } },
        select: { id: true },
      })
    ) {
      finalEmail = `${local}.${counter}@${schoolDomain}`;
      counter++;
      if (counter > 1000) {
        return NextResponse.json({ message: "Unable to generate unique email" }, { status: 400 });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // If requester is a teacher, enforce restrictions
    let finalRole = role;
    let finalAllowedFeatures = allowedFeatures || [];

    if (isTeacher) {
      // Teachers may only create students or parents
      const allowedRolesForTeacher = ["STUDENT", "PARENT"];
      if (!allowedRolesForTeacher.includes(role.toUpperCase())) {
        return NextResponse.json(
          { message: "Teachers can only create students or parents" },
          { status: 403 }
        );
      }

      // Ensure allowedFeatures is a subset of teacher's allowedFeatures
      const teacherFeatures: string[] = (session.user.allowedFeatures as string[]) || [];
      const invalid = (finalAllowedFeatures || []).filter(
        (f: string) => !teacherFeatures.includes(f)
      );

      if (invalid.length > 0) {
        return NextResponse.json(
          { message: "You cannot assign features you don't have permission for", invalid },
          { status: 403 }
        );
      }

      finalRole = role.toUpperCase();
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: finalEmail,
        password: hashedPassword,
        role: finalRole,
        schoolId: session.user.schoolId,
        ...(designation && { subject: designation }),
        allowedFeatures: finalAllowedFeatures || [],
      },
    });

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("User creation error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
