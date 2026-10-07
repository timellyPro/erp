import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  createNotificationsForUserIds,
  getClassStaffNotifyUserIds,
} from "@/lib/notificationService";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }

    const { certificateType, reason } = body;

    // Resolve student: use session.studentId or find student linked to this user (e.g. parent dashboard uses same user as student)
    let studentId = session.user.studentId ?? null;
    if (!studentId) {
      const student = await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: { id: true, schoolId: true },
      });
      if (student) {
        studentId = student.id;
      }
    }
    if (!studentId) {
      return NextResponse.json(
        { message: "Student record not found. Only students can request certificates." },
        { status: 400 }
      );
    }

    // Resolve schoolId from session or from student record
    let schoolId = session.user.schoolId ?? null;
    if (!schoolId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { schoolId: true },
      });
      schoolId = student?.schoolId ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found" },
        { status: 400 }
      );
    }

    // Allow multiple certificate requests - students can apply for multiple certificates
    // They can have multiple pending requests and multiple approved certificates
    // No restrictions - students may need multiple certificates of different or same types

    // Create certificate request (certificateType not in schema yet - stored in reason or future migration)
    const certificateRequest = await prisma.transferCertificate.create({
      data: {
        reason: reason || null,
        studentId,
        requestedById: session.user.id,
        schoolId,
        status: "PENDING",
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            class: {
              select: { id: true, name: true, section: true, teacherId: true },
            },
          },
        },
      },
    });

    try {
      const classTeacherId = certificateRequest.student.class?.teacherId ?? null;
      const notifyIds = await getClassStaffNotifyUserIds(schoolId, classTeacherId);
      if (notifyIds.length > 0) {
        const studentName =
          certificateRequest.student.user?.name?.trim() || "A student";
        await createNotificationsForUserIds(
          notifyIds,
          "CERTIFICATES",
          "New certificate request",
          `${studentName} submitted a certificate request`
        );
      }
    } catch (nErr) {
      console.warn("Certificate request notification failed:", nErr);
    }

    return NextResponse.json(
      { message: "Certificate request submitted successfully", certificateRequest },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Apply certificate request error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    
    // Provide more specific error messages
    let errorMessage = "Internal server error";
    if (error?.message) {
      if (error.message.includes("certificateType") || error.code === "P2022") {
        errorMessage = "Database schema needs to be updated. Please contact administrator.";
      } else {
        errorMessage = error.message;
      }
    } else if (error?.code) {
      switch (error.code) {
        case "P2002":
          errorMessage = "Database constraint violation. Please try again.";
          break;
        case "P2003":
          errorMessage = "Invalid student or school reference";
          break;
        case "P2022":
          errorMessage = "Database schema needs to be updated. Please contact administrator.";
          break;
        default:
          errorMessage = `Database error: ${error.code}`;
      }
    }
    
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}
