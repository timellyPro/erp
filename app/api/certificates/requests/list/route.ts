import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let schoolId = session.user.schoolId ?? null;
    let studentIdForFilter = session.user.studentId ?? null;

    // If no studentId in session (e.g. parent dashboard), try to find student linked to this user
    if (!studentIdForFilter) {
      const student = await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: { id: true, schoolId: true },
      });
      if (student) {
        studentIdForFilter = student.id;
        if (!schoolId) schoolId = student.schoolId;
      }
    }

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

    const where: Prisma.TransferCertificateWhereInput = {
      schoolId,
    };

    // For students (or parent viewing as student): only show their own certificate requests
    if (studentIdForFilter) {
      where.studentId = studentIdForFilter;
    }

    if (status) {
      where.status = status;
    }
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): read goes
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const certificateRequests = await withTenantScopedClient(schoolId, (tx) =>
      tx.transferCertificate.findMany({
        where,
        include: {
          student: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              class: {
                select: { id: true, name: true, section: true },
              },
            },
          },
          requestedBy: {
            select: { id: true, name: true, email: true },
          },
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    );
    return NextResponse.json({ certificateRequests }, { status: 200 });
  } catch (error: unknown) {
    logger.error("List certificate requests error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error) || "Internal server error" },
      { status: 500 }
    );
  }
}
