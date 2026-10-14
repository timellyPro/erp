import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

type TenantTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type RouteContext = { params: Promise<{ id: string }> | { params: { id: string } } };

function resolveId(raw: { id?: string; params?: { id: string } }): string {
  return raw.id ?? raw.params?.id ?? "";
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const raw = "then" in context.params ? await context.params : context.params;
    const homeworkId = resolveId(raw as { id?: string; params?: { id: string } });
    if (!homeworkId) {
      return NextResponse.json({ message: "Homework ID required" }, { status: 400 });
    }

    const currentUser = session.user;
    async function loadHomeworkAndSubmissions(client: TenantTx) {
      const homework = await client.homework.findUnique({
        where: { id: homeworkId },
        select: {
          id: true,
          title: true,
          subject: true,
          classId: true,
          schoolId: true,
          teacherId: true,
        },
      });
      if (!homework) return { kind: "notFound" as const };

      const role = currentUser.role as string;
      const isSchoolAdmin = role === "SCHOOLADMIN" || role === "SUPERADMIN";

      if (!isSchoolAdmin && role === "TEACHER") {
        if (homework.teacherId !== currentUser.id) {
          const classBelongs = await client.class.findFirst({
            where: { id: homework.classId, teacherId: currentUser.id },
          });
          if (!classBelongs) return { kind: "notOwnHomework" as const };
        }
      } else if (!isSchoolAdmin && role !== "TEACHER") {
        return { kind: "forbidden" as const };
      }

      if (homework.schoolId && currentUser.schoolId && homework.schoolId !== currentUser.schoolId) {
        return { kind: "notFound" as const };
      }

      const submissions = await client.homeworkSubmission.findMany({
        where: { homeworkId },
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              fatherName: true,
              rollNo: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { submittedAt: "desc" },
      });

      return { kind: "ok" as const, homework, submissions };
    }

    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): when the
    // caller's own schoolId is known, reads go through the app_tenant
    // connection, restricted by RLS, not just the post-fetch schoolId
    // check above. Falls back to the plain client only when
    // session.user.schoolId itself is missing.
    const result = session.user.schoolId
      ? await withTenantScopedClient(session.user.schoolId, loadHomeworkAndSubmissions)
      : await loadHomeworkAndSubmissions(prisma as unknown as TenantTx);

    if (result.kind === "notFound") {
      return NextResponse.json({ message: "Homework not found" }, { status: 404 });
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (result.kind === "notOwnHomework") {
      return NextResponse.json({ message: "You can only view submissions for your own homework" }, { status: 403 });
    }
    const { homework, submissions } = result;

    const list = submissions.map((s) => ({
      id: s.id,
      content: s.content,
      fileUrl: s.fileUrl,
      submittedAt: s.submittedAt,
      studentId: s.studentId,
      studentName: s.student.user?.name ?? s.student.fatherName ?? `Student ${s.student.admissionNumber}`,
      admissionNumber: s.student.admissionNumber,
      rollNo: s.student.rollNo,
    }));

    return NextResponse.json({
      homework: { id: homework.id, title: homework.title, subject: homework.subject },
      submissions: list,
    });
  } catch (e: unknown) {
    logger.error("Homework submissions error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
