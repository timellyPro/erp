import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    // Verify certificate request belongs to school
    const certificateRequest = await prisma.transferCertificate.findFirst({
      where: {
        id: id,
        schoolId: schoolId,
      },
      include: { student: { select: { userId: true } } },
    });

    if (!certificateRequest) {
      return NextResponse.json(
        { message: "Certificate request not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    if (certificateRequest.status !== "PENDING") {
      return NextResponse.json(
        { message: `Certificate request is already ${certificateRequest.status}` },
        { status: 400 }
      );
    }

    const updatedRequest = await prisma.transferCertificate.update({
      where: { id: id },
      data: {
        status: "REJECTED",
        approvedById: session.user.id,
      },
    });

    const studentUserId = certificateRequest.student?.userId;
    if (studentUserId) {
      await createNotification(
        studentUserId,
        "CERTIFICATES",
        "Certificate Rejected",
        "Your certificate request has been rejected."
      );
    }

    return NextResponse.json(
      { message: "Certificate request rejected", certificateRequest: updatedRequest },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reject certificate request error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
