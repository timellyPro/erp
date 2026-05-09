import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";
import { randomUUID } from "crypto";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    const err = new Error(`${field} is required`);
    (err as any).statusCode = 400;
    throw err;
  }
  return value.trim();
}

function optionalString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const rawBody = await req.json();
    const input =
      rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : ({} as Record<string, unknown>);
    const allowedFields = new Set([
      "applicationNo",
      "fedenaNo",
      "penNumber",
      "apaarId",
      "admissionNo",
      "classId",
      "gradeSought",
      "boardingType",
      "residencyType",
      "applicationFee",
      "admissionFee",
      "firstName",
      "middleName",
      "lastName",
      "gender",
      "dateOfBirth",
      "aadharNo",
      "firstLanguage",
      "nationality",
      "languagesAtHome",
      "caste",
      "religion",
      "houseNo",
      "street",
      "city",
      "town",
      "state",
      "pinCode",
      "parentName",
      "motherName",
      "motherPhone",
      "parentOccupation",
      "officeAddress",
      "parentPhone",
      "parentEmail",
      "parentAadharNo",
      "parentWhatsapp",
      "bankAccountNo",
      "previousSchoolName",
      "previousSchoolAddress",
      "emergencyFatherNo",
      "emergencyMotherNo",
      "emergencyGuardianNo",
    ]);
    const body: any = Object.fromEntries(
      Object.entries(input).filter(([key]) => allowedFields.has(key))
    );

    const classId =
      typeof body.classId === "string" && body.classId.trim() ? body.classId.trim() : null;
    let className: string | null = null;
    let section: string | null = null;
    if (classId) {
      const classExists = await prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, schoolId: true, name: true, section: true },
      });
      if (!classExists) {
        return NextResponse.json({ message: "Class not found" }, { status: 400 });
      }
      if (classExists.schoolId !== schoolId) {
        return NextResponse.json({ message: "Class does not belong to your school" }, { status: 400 });
      }
      className = classExists.name;
      section = classExists.section ?? null;
    }

    const dateOfBirthRaw = requiredString(body.dateOfBirth, "dateOfBirth");
    const dob = new Date(dateOfBirthRaw);
    if (Number.isNaN(dob.getTime())) {
      return NextResponse.json({ message: "Invalid dateOfBirth" }, { status: 400 });
    }

    const applicationNo = requiredString(body.applicationNo, "applicationNo");
    const aadharNo = optionalString(body.aadharNo) ?? `TMP-${randomUUID().slice(0, 12).toUpperCase()}`;

    const created = await prisma.studentApplication.create({
      data: {
        schoolId,
        classId,
        className,
        section,
        applicationNo,
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
        aadharNo,
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
        parentOccupation: requiredString(body.parentOccupation, "parentOccupation"),
        officeAddress: requiredString(body.officeAddress, "officeAddress"),
        parentPhone: requiredString(body.parentPhone, "parentPhone"),
        parentEmail: optionalString(body.parentEmail) ?? "-",
        parentAadharNo: (() => {
          const manual = optionalString(body.parentAadharNo);
          if (manual) return manual;
          const a = aadharNo.replace(/\D/g, "");
          return a.length >= 8 ? `${a.slice(0, 8)}0000` : `${a.padEnd(8, "0")}0000`;
        })(),
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
      select: {
        id: true,
        applicationNo: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ message: "Admission saved", application: created }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; meta?: any; statusCode?: number };

    if (err?.code === "P2002") {
      const field = Array.isArray(err?.meta?.target) ? err.meta.target[0] : undefined;
      return NextResponse.json({ message: `Duplicate value for ${field ?? "a unique field"}` }, { status: 400 });
    }

    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}

