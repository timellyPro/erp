import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  applyStudentResidencyConversion,
  previewStudentResidencyConversion,
} from "@/lib/applyStudentResidencyConversion";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";
import { invalidateStudentListCaches } from "@/lib/invalidateStudentListCaches";
import {
  academicYearLabel,
  academicYearStartYearFromYmd,
  kolkataYmd,
  residencyKind,
  residencyPeriodTitle,
} from "@/lib/residencyConversion";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";
import { upsertStudentFeeFromStructure } from "@/lib/studentTuitionFromStructure";

type RouteParams = { params: Promise<{ id: string }> };

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

async function authorize() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature =
    session.user.role === "TEACHER" &&
    (session.user.allowedFeatures?.includes("STUDENTS") ||
      session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  if (!isAdmin && !hasFeature) return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  const schoolId = await resolveSchoolId(session);
  if (!schoolId) return { error: NextResponse.json({ message: "School not found" }, { status: 400 }) };
  return { schoolId };
}

function periodPayload(row: {
  residencyType: string;
  startedOn: Date;
  endedOn: Date | null;
  months: number;
  transportLabel: string | null;
}) {
  const kind = residencyKind(row.residencyType);
  return {
    residencyType: row.residencyType,
    title: kind ? residencyPeriodTitle(kind) : row.residencyType,
    startedOn: row.startedOn.toISOString().slice(0, 10),
    endedOn: row.endedOn ? row.endedOn.toISOString().slice(0, 10) : null,
    months: row.months,
    transportLabel: row.transportLabel,
  };
}

export async function GET(req: Request, context: RouteParams) {
  const { id } = await context.params;
  const auth = await authorize();
  if ("error" in auth && auth.error) return auth.error;
  const schoolId = auth.schoolId;
  if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

  const student = await prisma.student.findFirst({
    where: { id, schoolId },
    select: {
      id: true,
      residencyType: true,
      classId: true,
      class: { select: { section: true } },
    },
  });
  if (!student) return NextResponse.json({ message: "Student not found" }, { status: 404 });

  const url = new URL(req.url);
  const toRaw = url.searchParams.get("to");
  const year = academicYearStartYearFromYmd(kolkataYmd());
  const saved = await prisma.studentResidencyPeriod.findMany({
    where: { studentId: id, academicYearStartYear: year },
    orderBy: { startedOn: "asc" },
  });

  if (!toRaw) {
    return NextResponse.json({
      academicYearLabel: academicYearLabel(year),
      periods: saved.map(periodPayload),
    });
  }

  const fromResidency = residencyKind(student.residencyType);
  const toResidency = residencyKind(toRaw);
  if (!fromResidency || !toResidency || fromResidency === toResidency) {
    return NextResponse.json(
      { message: "Choose Hostel or Day Scholar, different from this student's current type." },
      { status: 400 }
    );
  }

  const preview = await previewStudentResidencyConversion(prisma, {
    schoolId,
    studentId: id,
    classId: student.classId,
    section: student.class?.section ?? null,
    fromResidency,
    toResidency,
    transportKey: url.searchParams.get("transportKey"),
  });

  return NextResponse.json({
    ...preview,
    periods: preview.periods.map((period) => ({
      ...period,
      title: residencyPeriodTitle(period.residencyType),
    })),
    savedPeriods: saved.map(periodPayload),
  });
}

export async function POST(req: Request, context: RouteParams) {
  const { id } = await context.params;
  const auth = await authorize();
  if ("error" in auth && auth.error) return auth.error;
  const schoolId = auth.schoolId;
  if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

  const student = await prisma.student.findFirst({
    where: { id, schoolId },
    select: {
      id: true,
      residencyType: true,
      classId: true,
      class: { select: { section: true } },
    },
  });
  if (!student) return NextResponse.json({ message: "Student not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const fromResidency = residencyKind(student.residencyType);
  const toResidency = residencyKind(typeof body.toResidency === "string" ? body.toResidency : "");
  if (!fromResidency || !toResidency || fromResidency === toResidency) {
    return NextResponse.json(
      { message: "Choose Hostel or Day Scholar, different from this student's current type." },
      { status: 400 }
    );
  }

  try {
    const preview = await applyStudentResidencyConversion(prisma, {
      schoolId,
      studentId: id,
      classId: student.classId,
      section: student.class?.section ?? null,
      fromResidency,
      toResidency,
      transportKey: typeof body.transportKey === "string" ? body.transportKey : null,
    });

    const fee = await prisma.studentFee.findUnique({
      where: { studentId: id },
      select: { discountPercent: true, amountPaid: true },
    });
    await upsertStudentFeeFromStructure(prisma, {
      schoolId,
      studentId: id,
      classId: student.classId,
      section: student.class?.section ?? null,
      discountPercent: fee?.discountPercent ?? 0,
      amountPaid: fee?.amountPaid ?? 0,
      residencyType: toResidency,
    });
    invalidateStudentFeeReadCaches({ studentId: id, schoolId });
    invalidateStudentListCaches(schoolId);
    await computeAdminStudentFeeBreakdown(schoolId, id, {
      migrateLumps: false,
      cleanupHostelMessDuplicates: false,
    });

    return NextResponse.json({
      message: `Converted this student to ${residencyPeriodTitle(toResidency)}. Existing receipts were not changed.`,
      residencyType: toResidency,
      academicYearLabel: preview.academicYearLabel,
      periods: preview.periods.map((period) => ({
        ...period,
        title: residencyPeriodTitle(period.residencyType),
      })),
      charges: preview.charges,
    });
  } catch (error: unknown) {
    const coded = error as Error & { code?: string; preview?: unknown };
    if (coded.code === "TRANSPORT_REQUIRED") {
      return NextResponse.json(
        { message: coded.message, code: coded.code, preview: coded.preview },
        { status: 400 }
      );
    }
    console.error("Residency conversion error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not convert residency" },
      { status: 500 }
    );
  }
}
