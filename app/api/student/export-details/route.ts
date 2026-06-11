import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  buildStudentDetailsExportWorkbook,
  studentToDetailsExportRow,
} from "@/lib/studentDetailsExport";

const MAX_EXPORT = 5000;

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
    if (schoolId) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { schoolId },
      });
    }
  }
  return schoolId;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    if (session.user.schoolIsActive === false) {
      return NextResponse.json({ message: "School is paused" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() || "";
    const className = searchParams.get("className")?.trim() || "";
    const section = searchParams.get("section")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const where: Prisma.StudentWhereInput = { schoolId };

    if (status.toLowerCase() === "active") {
      where.status = "Active";
    } else if (status.toLowerCase() === "inactive") {
      where.status = "Inactive";
    }

    if (classId) {
      const classData = await prisma.class.findFirst({
        where: { id: classId, schoolId },
        select: { id: true },
      });
      if (!classData) {
        return NextResponse.json(
          { message: "Class not found or doesn't belong to your school" },
          { status: 404 }
        );
      }
      where.classId = classId;
    } else if (className) {
      where.class = {
        schoolId,
        name: className,
        ...(section ? { section } : {}),
      };
    }

    const students = await prisma.student.findMany({
      where,
      take: MAX_EXPORT,
      include: {
        user: { select: { name: true, email: true } },
        class: { select: { name: true, section: true } },
        application: {
          select: {
            createdAt: true,
            nationality: true,
            languagesAtHome: true,
            religion: true,
            caste: true,
            parentPhone: true,
            emergencyMotherNo: true,
            parentEmail: true,
            motherName: true,
            houseNo: true,
            street: true,
            city: true,
            town: true,
            state: true,
            pinCode: true,
          },
        },
      },
      orderBy: [{ user: { name: "asc" } }],
    });

    const rows = students.map((s, i) => studentToDetailsExportRow(s, i + 1));
    const wb = buildStudentDetailsExportWorkbook(rows);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const body = new Uint8Array(buf);

    const filename = `Student-details-report.xlsx`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Student details export error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
