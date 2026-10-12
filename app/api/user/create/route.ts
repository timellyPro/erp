import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "../../../../lib/db";
import bcrypt from "bcryptjs";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/school/schoolEmail";
import { purgeSchoolDashboardServerCacheMatching } from "@/lib/school/schoolDashboardServerCache";
import { sanitizeTeachingClassIds } from "@/lib/teacher/teacherClassAccess";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { runInTenantScope } from "@/lib/db/tenantContext";
import type { Role } from "@prisma/client";

const createUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().optional().nullable(),
  role: z.string().min(1),
  designation: z.string().optional().nullable(),
  password: z.string().min(1),
  allowedFeatures: z.array(z.string()).optional().nullable(),
  teacherId: z.union([z.string(), z.number()]).optional().nullable(),
  subjects: z.array(z.unknown()).optional().nullable(),
  assignedClassIds: z.array(z.unknown()).optional().nullable(),
  qualification: z.union([z.string(), z.number()]).optional().nullable(),
  experience: z.union([z.string(), z.number()]).optional().nullable(),
  joiningDate: z.string().optional().nullable(),
  teacherStatus: z.string().optional().nullable(),
  mobile: z.union([z.string(), z.number()]).optional().nullable(),
  address: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    return await runInTenantScope(session.user.schoolId, async () => {
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

    const rawBody = await req.json().catch(() => null);
    const parsedBody = createUserBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }
    const {
      name,
      email,
      role,
      designation,
      password,
      allowedFeatures,
      // Teacher-specific
      teacherId,
      subjects,
      assignedClassIds,
      qualification,
      experience,
      joiningDate,
      teacherStatus,
      mobile,
      address,
    } = parsedBody.data;

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
      // Teachers may only create students
      const allowedRolesForTeacher = ["STUDENT"];
      if (!allowedRolesForTeacher.includes(role.toUpperCase())) {
        return NextResponse.json(
          { message: "Teachers can only create students" },
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

    const schoolId = session.user.schoolId as string;

    // Parse joining date (dd-mm-yyyy or ISO)
    let joiningDateParsed: Date | undefined;
    if (joiningDate && typeof joiningDate === "string") {
      const ddmmyyyy = joiningDate.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        joiningDateParsed = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      } else {
        joiningDateParsed = new Date(joiningDate);
      }
      if (isNaN(joiningDateParsed.getTime())) joiningDateParsed = undefined;
    }

    const teacherSubjects =
      Array.isArray(subjects) && subjects.every((s: unknown) => typeof s === "string")
        ? (subjects as string[]).filter(Boolean)
        : [];
    const teachingClassIds =
      finalRole === "TEACHER"
        ? await sanitizeTeachingClassIds(assignedClassIds, schoolId)
        : [];

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: finalEmail,
        password: hashedPassword,
        role: finalRole as Role,
        schoolId,
        ...(designation && { subject: designation }),
        allowedFeatures: finalAllowedFeatures || [],
        // Teacher fields (only applied when role is TEACHER)
        ...(finalRole === "TEACHER" && {
          teacherId: teacherId && String(teacherId).trim() ? String(teacherId).trim() : null,
          subject: teacherSubjects[0] || designation || null,
          subjects: teacherSubjects,
          teachingClassIds,
          qualification: qualification && String(qualification).trim() ? String(qualification).trim() : null,
          experience: experience && String(experience).trim() ? String(experience).trim() : null,
          joiningDate: joiningDateParsed || null,
          teacherStatus: teacherStatus && String(teacherStatus).trim() ? String(teacherStatus).trim() : "Active",
          mobile: mobile && String(mobile).trim() ? String(mobile).trim() : null,
          address: address && String(address).trim() ? String(address).trim() : null,
        }),
      },
    });

    if (finalRole === "TEACHER" && schoolId) {
      purgeSchoolDashboardServerCacheMatching(`teacher:list:${schoolId}`);
      purgeSchoolDashboardServerCacheMatching(`class:list:lite:${schoolId}`);
    }

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
    });
  } catch (error: unknown) {
    logger.error("User creation error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
