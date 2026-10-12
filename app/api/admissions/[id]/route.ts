import { NextResponse } from "next/server";
import { z } from "zod";
import type { Grade, BoardingType, Gender } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { getApplicationGateRow } from "@/lib/admission/admissionsListQuery";
import { studentApplicationDetailSelect } from "@/lib/admission/studentApplicationSafeSelect";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";
import { HttpError, getErrorMessage, getErrorCode, getErrorMeta, getErrorStatusCode } from "@/lib/errors/errorInfo";

function optionalString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(`${field} is required`, 400);
  }
  return value.trim();
}

function normalizeResidencyType(value: unknown) {
  if (typeof value !== "string") return "Day Scholar";
  const raw = value.trim();
  if (!raw) return "Day Scholar";
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "dayscholar" || normalized === "dayscholer") return "Day Scholar";
  if (
    normalized === "hostel" ||
    normalized === "hostler" ||
    normalized === "hosteler" ||
    normalized === "hosteller" ||
    normalized === "hoster"
  ) {
    return "Hosteller";
  }
  if (normalized === "rte") return "RTE";
  return raw;
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { id } = await ctx.params;
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filter above.
    const { application, gate } = await withTenantScopedClient(schoolId, async (tx) => {
      const app = await tx.studentApplication.findFirst({
        where: { id, schoolId },
        select: {
          ...studentApplicationDetailSelect,
          class: { select: { id: true, name: true, section: true } },
        },
      });
      if (!app) return { application: null, gate: null };
      const g = await getApplicationGateRow(tx, id, schoolId);
      return { application: app, gate: g };
    });
    if (!application) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json(
      {
        application: {
          ...application,
          workflowStatus: gate?.workflowStatus ?? "PENDING",
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json({ message: getErrorMessage(e) ?? "Internal server error" }, { status: getErrorStatusCode(e) ?? 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { id } = await ctx.params;
    const rawBody = await req.json();
    const parsedBody = z.record(z.string(), z.unknown()).safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;

    const classId = typeof body.classId === "string" && body.classId.trim() ? body.classId.trim() : null;
    if (classId) {
      const classExists = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, schoolId: true } });
      if (!classExists) return NextResponse.json({ message: "Class not found" }, { status: 400 });
      if (classExists.schoolId !== schoolId) return NextResponse.json({ message: "Class does not belong to your school" }, { status: 400 });
    }

    const dateOfBirthRaw = requiredString(body.dateOfBirth, "dateOfBirth");
    const dob = new Date(dateOfBirthRaw);
    if (Number.isNaN(dob.getTime())) {
      return NextResponse.json({ message: "Invalid dateOfBirth" }, { status: 400 });
    }

    const classMeta = classId
      ? await prisma.class.findUnique({
          where: { id: classId },
          select: { name: true, section: true },
        })
      : null;

    let applicationNoForUpdate = optionalString(body.applicationNo);
    if (!applicationNoForUpdate) {
      const existingApp = await prisma.studentApplication.findFirst({
        where: { id, schoolId },
        select: { applicationNo: true },
      });
      applicationNoForUpdate = existingApp?.applicationNo ?? "";
    }
    if (!applicationNoForUpdate) {
      return NextResponse.json({ message: "applicationNo is required" }, { status: 400 });
    }

    const aadharValue = optionalString(body.aadharNo) ?? `TMP-${id.slice(0, 8).toUpperCase()}-${Date.now()}`;
    const aadharForParent = aadharValue.replace(/\D/g, "");
    const parentAadharDefault =
      aadharForParent.length >= 8 ? `${aadharForParent.slice(0, 8)}0000` : `${aadharForParent.padEnd(8, "0")}0000`;

    const linkedStudent = await prisma.studentApplication.findFirst({
      where: { id, schoolId },
      select: { studentId: true },
    });
    if (!linkedStudent) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const updated = await prisma.studentApplication.update({
      where: { id },
      data: {
        classId,
        className: classMeta?.name ?? null,
        section: classMeta?.section ?? null,
        applicationNo: applicationNoForUpdate,
        fedenaNo: optionalString(body.fedenaNo),
        penNumber: optionalString(body.penNumber),
        apaarId: optionalString(body.apaarId),
        admissionNo: optionalString(body.admissionNo),
        gradeSought: body.gradeSought as Grade,
        boardingType: body.boardingType as BoardingType,
        residencyType: normalizeResidencyType(body.residencyType),
        totalFee: null,
        discountPercent: null,
        applicationFee:
          typeof body.applicationFee === "number"
            ? body.applicationFee
            : typeof body.applicationFee === "string" && String(body.applicationFee).trim()
            ? Number(body.applicationFee)
            : null,
        admissionFee:
          typeof body.admissionFee === "number"
            ? body.admissionFee
            : typeof body.admissionFee === "string" && String(body.admissionFee).trim()
            ? Number(body.admissionFee)
            : null,
        firstName: requiredString(body.firstName, "firstName"),
        middleName: optionalString(body.middleName),
        lastName: requiredString(body.lastName, "lastName"),
        gender: body.gender as Gender,
        dateOfBirth: dob,
        aadharNo: aadharValue,
        firstLanguage: optionalString(body.firstLanguage) ?? "English",
        nationality: requiredString(body.nationality, "nationality"),
        languagesAtHome: requiredString(body.languagesAtHome, "languagesAtHome"),
        caste: optionalString(body.caste),
        religion: optionalString(body.religion),
        houseNo: requiredString(body.houseNo, "houseNo"),
        street: requiredString(body.street, "street"),
        city: requiredString(body.city, "city"),
        town: optionalString(body.town),
        state: requiredString(body.state, "state"),
        pinCode: requiredString(body.pinCode, "pinCode"),
        parentName: requiredString(body.parentName, "parentName"),
        motherName: optionalString(body.motherName),
        motherAadharNo: optionalString(body.motherAadharNo),
        motherEmail: optionalString(body.motherEmail),
        parentOccupation: requiredString(body.parentOccupation, "parentOccupation"),
        officeAddress: requiredString(body.officeAddress, "officeAddress"),
        parentPhone: requiredString(body.parentPhone, "parentPhone"),
        parentEmail: optionalString(body.parentEmail) ?? "-",
        parentAadharNo: optionalString(body.parentAadharNo) ?? parentAadharDefault,
        parentWhatsapp: requiredString(body.parentWhatsapp, "parentWhatsapp"),
        bankAccountNo: optionalString(body.bankAccountNo) ?? "-",
        previousSchoolName: optionalString(body.previousSchoolName) ?? "-",
        previousSchoolAddress: optionalString(body.previousSchoolAddress) ?? "-",
        emergencyFatherNo: optionalString(body.emergencyFatherNo) ?? "-",
        emergencyMotherNo:
          optionalString(body.emergencyMotherNo) ??
          optionalString((body as Record<string, unknown>).motherPhone) ??
          "-",
        emergencyGuardianNo: optionalString(body.emergencyGuardianNo) ?? "-",
      },
      select: { id: true },
    });

    // safety: tenant check (avoid leaking existence across tenants)
    const tenantRow = await prisma.studentApplication.findFirst({ where: { id: updated.id, schoolId }, select: { id: true } });
    if (!tenantRow) return NextResponse.json({ message: "Not found" }, { status: 404 });

    // Student profile reads `Student.motherName` / `Student.fatherName`, not the application row.
    if (linkedStudent.studentId) {
      const studentInSchool = await prisma.student.findFirst({
        where: { id: linkedStudent.studentId, schoolId },
        select: { id: true },
      });
      if (studentInSchool) {
        await prisma.student.update({
          where: { id: studentInSchool.id },
          data: {
            fatherName: requiredString(body.parentName, "parentName"),
            motherName: optionalString(body.motherName),
          },
        });
      }
    }

    return NextResponse.json({ message: "Updated", id: updated.id }, { status: 200 });
    });
  } catch (e: unknown) {
    if (getErrorCode(e) === "P2002") {
      const meta = getErrorMeta(e);
      const target = meta && typeof meta === "object" && "target" in meta ? (meta as { target?: unknown }).target : undefined;
      const field = Array.isArray(target) ? target[0] : undefined;
      return NextResponse.json({ message: `Duplicate value for ${field ?? "a unique field"}` }, { status: 400 });
    }
    return NextResponse.json({ message: getErrorMessage(e) ?? "Internal server error" }, { status: getErrorStatusCode(e) ?? 500 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    return await runInTenantScope(schoolId, async (schoolId) => {

    const { id } = await ctx.params;
    const exists = await prisma.studentApplication.findFirst({
      where: { id, schoolId },
      select: { id: true, studentId: true },
    });
    if (!exists) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (exists.studentId) {
      return NextResponse.json(
        { message: "Cannot delete an application that has been converted to a student" },
        { status: 400 }
      );
    }

    await prisma.studentApplication.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" }, { status: 200 });
    });
  } catch (e: unknown) {
    return NextResponse.json({ message: getErrorMessage(e) ?? "Internal server error" }, { status: getErrorStatusCode(e) ?? 500 });
  }
}

