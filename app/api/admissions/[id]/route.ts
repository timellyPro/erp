import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getApplicationGateRow } from "@/lib/admissionsListQuery";
import { studentApplicationDetailSelect } from "@/lib/studentApplicationSafeSelect";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";

function optionalString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    const err = new Error(`${field} is required`);
    (err as any).statusCode = 400;
    throw err;
  }
  return value.trim();
}

function normalizeResidencyType(value: unknown) {
  if (typeof value !== "string") return "Day Scholar";
  const raw = value.trim();
  if (!raw) return "Day Scholar";
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "dayscholar" || normalized === "dayscholer") return "Day Scholar";
  if (normalized === "hostler" || normalized === "hosteler" || normalized === "hosteller" || normalized === "hoster") {
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
    const application = await prisma.studentApplication.findFirst({
      where: { id, schoolId },
      select: {
        ...studentApplicationDetailSelect,
        class: { select: { id: true, name: true, section: true } },
      },
    });
    if (!application) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const gate = await getApplicationGateRow(prisma, id, schoolId);
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
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json({ message: err?.message ?? "Internal server error" }, { status: err?.statusCode ?? 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { id } = await ctx.params;
    const body = await req.json();

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
        gradeSought: body.gradeSought,
        boardingType: body.boardingType,
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
        gender: body.gender,
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
        emergencyMotherNo: optionalString(body.emergencyMotherNo) ?? "-",
        emergencyGuardianNo: optionalString(body.emergencyGuardianNo) ?? "-",
      },
      select: { id: true },
    });

    // safety: tenant check (avoid leaking existence across tenants)
    const tenantRow = await prisma.studentApplication.findFirst({ where: { id: updated.id, schoolId }, select: { id: true } });
    if (!tenantRow) return NextResponse.json({ message: "Not found" }, { status: 404 });

    return NextResponse.json({ message: "Updated", id: updated.id }, { status: 200 });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; meta?: any; statusCode?: number };
    if (err?.code === "P2002") {
      const field = Array.isArray(err?.meta?.target) ? err.meta.target[0] : undefined;
      return NextResponse.json({ message: `Duplicate value for ${field ?? "a unique field"}` }, { status: 400 });
    }
    return NextResponse.json({ message: err?.message ?? "Internal server error" }, { status: err?.statusCode ?? 500 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

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
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json({ message: err?.message ?? "Internal server error" }, { status: err?.statusCode ?? 500 });
  }
}

