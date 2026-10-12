import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInOptionalTenantScope } from "@/lib/db/tenantContext";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Find student by userId instead of studentId
    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: {
        address: true,
        fatherName: true,
        motherName: true,
        occupation: true,
        phoneNo: true,
      },
    });

    if (!student) {
      // Return empty values if student not found (user might not be a student)
      return NextResponse.json({
        address: "",
        fatherName: "",
        motherName: "",
        occupation: "",
        fatherPhone: "",
      });
    }

    return NextResponse.json({
      address: student.address ?? "",
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      occupation: student.occupation ?? "",
      fatherPhone: student.phoneNo ?? "",
    });
  } catch (e: unknown) {
    logger.error("Get parent details error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    return await runInOptionalTenantScope(session?.user?.schoolId, async () => {
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Find student by userId
    const existingStudent = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!existingStudent) {
      return NextResponse.json(
        { message: "Student record not found for this user" },
        { status: 404 }
      );
    }

    const updateParentDetailsBodySchema = z.object({
      address: z.string().optional().nullable(),
      fatherName: z.string().optional().nullable(),
      motherName: z.string().optional().nullable(),
      occupation: z.string().optional().nullable(),
      fatherPhone: z.string().optional().nullable(),
    });
    const parsedBody = updateParentDetailsBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const {
      address,
      fatherName,
      motherName,
      occupation,
      fatherPhone,
    } = parsedBody.data;

    const updateData: Prisma.StudentUpdateInput = {};
    if (address !== undefined) updateData.address = address || null;
    if (fatherName) updateData.fatherName = fatherName;
    if (motherName !== undefined) updateData.motherName = motherName || null;
    if (occupation !== undefined) updateData.occupation = occupation || null;
    if (fatherPhone) updateData.phoneNo = fatherPhone;

    await prisma.student.update({
      where: { id: existingStudent.id },
      data: updateData,
    });

    return NextResponse.json({ message: "Parent details updated successfully" });
    });
  } catch (e: unknown) {
    logger.error("Update parent details error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
