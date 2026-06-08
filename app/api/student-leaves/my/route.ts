import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  parentPortalSwrRead,
  parentPortalSwrWrite,
  PARENT_LIST_TTL,
} from "@/lib/parentPortalSwr";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const bypassCache = new URL(request.url).searchParams.get("refresh") === "1";

    const student = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true, schoolId: true },
    });
    if (!student) return NextResponse.json({ message: "Student not found" }, { status: 400 });

    const serverKey = `parent:${student.id}:leaves:my`;
    if (!bypassCache) {
      const hit = await parentPortalSwrRead<unknown[]>({
        schoolId: student.schoolId,
        namespace: "api",
        resource: "parent:leaves:my",
        params: { studentId: student.id },
        serverKey,
        ttl: PARENT_LIST_TTL,
      });
      if (hit.value) {
        return NextResponse.json(hit.value, { status: 200 });
      }
    }

    const leaves = await prisma.studentLeaveRequest.findMany({
      where: { studentId: student.id },
      orderBy: { fromDate: "desc" },
    });

    if (!bypassCache) {
      await parentPortalSwrWrite({
        schoolId: student.schoolId,
        namespace: "api",
        resource: "parent:leaves:my",
        params: { studentId: student.id },
        serverKey,
        ttl: PARENT_LIST_TTL,
        value: leaves,
      });
    }

    return NextResponse.json(leaves, { status: 200 });
  } catch (e: unknown) {
    console.error("Student leaves my:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
