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

    // Verify TC belongs to school
    const tc = await prisma.transferCertificate.findFirst({
      where: {
        id: id,
        schoolId: schoolId,
      },
      include: { student: { select: { userId: true } } },
    });

    if (!tc) {
      return NextResponse.json(
        { message: "TC not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    if (tc.status !== "PENDING") {
      return NextResponse.json(
        { message: `TC is already ${tc.status}` },
        { status: 400 }
      );
    }

    const updatedTC = await prisma.transferCertificate.update({
      where: { id: id },
      data: {
        status: "REJECTED",
        approvedById: session.user.id,
      },
    });

    const studentUserId = tc.student?.userId;
    if (studentUserId) {
      await createNotification(
        studentUserId,
        "CERTIFICATES",
        "Transfer Certificate Rejected",
        "Your Transfer Certificate request has been rejected."
      );
    }

    return NextResponse.json(
      { message: "TC request rejected", tc: updatedTC },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reject TC error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
