import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/authOptions";
import prisma from "../../../../lib/db";
import bcrypt from "bcryptjs";
import { purgeSchoolDashboardServerCacheMatching } from "@/lib/schoolDashboardServerCache";
import { sanitizeTeachingClassIds } from "@/lib/teacherClassAccess";

type Params = Promise<{ id: string }>;

// GET /api/user/[id] - Fetch single user
export async function GET(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subject: true,
        subjects: true,
        schoolId: true,
        allowedFeatures: true,
        createdAt: true,
        teacherId: true,
        qualification: true,
        experience: true,
        joiningDate: true,
        teacherStatus: true,
        mobile: true,
        address: true,
        teachingClassIds: true,
        assignedClasses: { select: { id: true, name: true, section: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Check if requester has access to this school
    if (user.schoolId !== session.user.schoolId) {
      return NextResponse.json(
        { message: "You do not have access to this user" },
        { status: 403 }
      );
    }

    const assignedClassIds = Array.isArray(user.teachingClassIds)
      ? user.teachingClassIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const { assignedClasses, teachingClassIds, ...rest } = user;
    return NextResponse.json({
      ...rest,
      teachingClassIds,
      designation: user.subject,
      assignedClassIds,
      assignedClasses,
    });
  } catch (error: any) {
    console.error("User fetch error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/user/[id] - Update user
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      name,
      email,
      role,
      designation,
      password,
      allowedFeatures,
      teacherId,
      subjects,
      assignedClassIds,
      qualification,
      experience,
      joiningDate,
      teacherStatus,
      mobile,
      address,
      photoUrl,
    } = body;

    console.log(`[PUT] /api/user/${id} called by ${session.user?.id} (role=${session.user?.role})`);

    // Check if user exists and belongs to same school
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, schoolId: true, role: true },
    });

    if (!user) {
      console.warn(`User not found for id=${id}`);
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (user.schoolId !== session.user.schoolId) {
      return NextResponse.json(
        { message: "You do not have access to this user" },
        { status: 403 }
      );
    }

    // Check if new email is unique (if changing email)
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { schoolId_email: { schoolId: user.schoolId!, email } },
      });
      if (existingUser) {
        return NextResponse.json(
          { message: "Email already in use" },
          { status: 400 }
        );
      }
    }

    const schoolId = (user.schoolId || session.user.schoolId) as string;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (designation !== undefined) updateData.subject = designation;
    if (allowedFeatures !== undefined) updateData.allowedFeatures = allowedFeatures;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Teacher-specific fields
    if (user.role === "TEACHER") {
      if (teacherId !== undefined) updateData.teacherId = teacherId && String(teacherId).trim() ? String(teacherId).trim() : null;
      if (subjects !== undefined) {
        const arr = Array.isArray(subjects) && subjects.every((s: unknown) => typeof s === "string") ? (subjects as string[]).filter(Boolean) : [];
        updateData.subjects = arr;
        if (arr[0]) updateData.subject = arr[0];
      }
      if (assignedClassIds !== undefined) {
        // Teaching assignments (marks/homework) — do NOT overwrite Class.teacherId (class teacher).
        updateData.teachingClassIds = await sanitizeTeachingClassIds(
          assignedClassIds,
          schoolId
        );
      }
      if (qualification !== undefined) updateData.qualification = qualification && String(qualification).trim() ? String(qualification).trim() : null;
      if (experience !== undefined) updateData.experience = experience && String(experience).trim() ? String(experience).trim() : null;
      if (joiningDate !== undefined) {
        if (joiningDate && typeof joiningDate === "string") {
          const ddmmyyyy = joiningDate.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
          if (ddmmyyyy) {
            const [, d, m, y] = ddmmyyyy;
            updateData.joiningDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
          } else {
            updateData.joiningDate = new Date(joiningDate);
          }
        } else {
          updateData.joiningDate = null;
        }
      }
      if (teacherStatus !== undefined) updateData.teacherStatus = teacherStatus && String(teacherStatus).trim() ? String(teacherStatus).trim() : "Active";
      if (mobile !== undefined) updateData.mobile = mobile && String(mobile).trim() ? String(mobile).trim() : null;
      if (address !== undefined) updateData.address = address && String(address).trim() ? String(address).trim() : null;
    }

    if (photoUrl !== undefined) {
      updateData.photoUrl = photoUrl && String(photoUrl).trim() ? String(photoUrl).trim() : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subject: true,
        subjects: true,
        allowedFeatures: true,
        teacherId: true,
        teachingClassIds: true,
        qualification: true,
        experience: true,
        joiningDate: true,
        teacherStatus: true,
        mobile: true,
        address: true,
        photoUrl: true,
      },
    });
    if (user.role === "TEACHER") {
      purgeSchoolDashboardServerCacheMatching(`teacher:list:${schoolId}`);
      purgeSchoolDashboardServerCacheMatching(`class:list:lite:${schoolId}`);
    }

    return NextResponse.json({
      message: "User updated successfully",
      user: {
        ...updatedUser,
        designation: updatedUser.subject,
        assignedClassIds: updatedUser.teachingClassIds ?? [],
      },
    });
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/user/[id] - Delete user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if user has permission to delete users
    if (!["SCHOOLADMIN", "SUPERADMIN"].includes(session.user.role)) {
      return NextResponse.json(
        { message: "You do not have permission to delete users" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if user exists and belongs to same school
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (user.schoolId !== session.user.schoolId) {
      return NextResponse.json(
        { message: "You do not have access to this user" },
        { status: 403 }
      );
    }

    // Don't allow deleting the current user
    if (user.id === session.user.id) {
      return NextResponse.json(
        { message: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    // Soft delete by setting email/name to indicate deletion
    await prisma.user.delete({
      where: { id },
    });
    if (user.role === "TEACHER" && user.schoolId) {
      purgeSchoolDashboardServerCacheMatching(`teacher:list:${user.schoolId}`);
      purgeSchoolDashboardServerCacheMatching(`class:list:lite:${user.schoolId}`);
    }

    return NextResponse.json({
      message: "User deleted successfully",
    });
  } catch (error: any) {
    console.error("User deletion error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
