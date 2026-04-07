import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";
import { randomUUID } from "crypto";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";

function toStr(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\.0$/, "").trim();
}

function normalizePhone(value: unknown) {
  return toStr(value).replace(/\s/g, "");
}

function normalizeAadhaar(value: unknown) {
  return toStr(value).replace(/[\s-]/g, "");
}

function parseDob(rawDob: any): Date {
  if (!rawDob) throw new Error("Date of birth (dob) is required");
  if (typeof rawDob === "number") {
    const d = XLSX.SSF.parse_date_code(rawDob);
    const dt = new Date(d.y, d.m - 1, d.d);
    if (Number.isNaN(dt.getTime())) throw new Error("Invalid date of birth");
    return dt;
  }
  const dt = new Date(rawDob);
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid date of birth");
  return dt;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const createStudents = (searchParams.get("createStudents") ?? "true") !== "false";

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ message: "Excel file required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    if (!rows.length) return NextResponse.json({ message: "Excel empty" }, { status: 400 });

    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
    });
    const [school, settings] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
      prisma.schoolSettings.findUnique({ where: { schoolId }, select: { emailDomain: true, defaultInstallments: true } as any }),
    ]);
    const schoolDomain =
      normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");
    const schoolDefaultInstallments =
      Number.isInteger((settings as any)?.defaultInstallments) && (settings as any).defaultInstallments > 0
        ? (settings as any).defaultInstallments
        : 3;
    const year = new Date().getFullYear();

    const createdApplications: any[] = [];
    const convertedStudents: any[] = [];
    const failed: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = toStr(row.name);
        const fatherName = toStr(row.fatherName);
        const rollNo = toStr(row.rollNo ?? row.studentId);
        const phoneNo = normalizePhone(row.phoneNo ?? row.contactNumber);
        const aadhaarNo = normalizeAadhaar(row.aadhaarNo ?? row.aadhaarNoRaw);
        const genderRaw = toStr(row.gender);
        const dobDate = parseDob(row.dob ?? row.dateOfBirth);
        const previousSchool = toStr(row.previousSchool);
        const className = toStr(row.class ?? row.className);
        const section = toStr(row.section);
        const totalFee = row.totalFee === "" || row.totalFee == null ? null : Number(row.totalFee);
        const discountPercent = row.discountPercent === "" || row.discountPercent == null ? null : Number(row.discountPercent);
        const applicationFee =
          row.applicationFee === "" || row.applicationFee == null || row["Application Fee"] === ""
            ? null
            : Number(row.applicationFee ?? row["Application Fee"]);
        const admissionFee =
          row.admissionFee === "" || row.admissionFee == null || row["Admission Fee"] === ""
            ? null
            : Number(row.admissionFee ?? row["Admission Fee"]);
        const email = toStr(row.email);
        const address = toStr(row.address);

        if (!name || name.length < 2) throw new Error("Name is required (min 2 characters)");
        if (!fatherName || fatherName.length < 2) throw new Error("Parent name is required (min 2 characters)");
        if (!phoneNo || !/^\d{10}$/.test(phoneNo)) throw new Error("Contact number must be exactly 10 digits");
        if (!aadhaarNo || !/^\d{12}$/.test(aadhaarNo)) throw new Error("Aadhaar number must be exactly 12 digits");
        if (totalFee != null && (!Number.isFinite(totalFee) || totalFee <= 0)) throw new Error("totalFee must be a positive number");
        if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
          throw new Error("discountPercent must be between 0 and 100");
        }

        let classId: string | null = null;
        if (className) {
          const match = classes.find((c) => {
            const sameName = (c.name || "").trim().toLowerCase() === className.toLowerCase();
            const sameSection = !section || (c.section || "").trim().toLowerCase() === section.toLowerCase();
            return sameName && sameSection;
          });
          if (match) classId = match.id;
        }

        const [firstName, ...rest] = name.split(" ").filter(Boolean);
        const lastName = rest.length ? rest[rest.length - 1] : "Student";
        const middleName = rest.length > 1 ? rest.slice(0, -1).join(" ") : null;

        const applicationNo = `APP/${year}/${randomUUID().slice(0, 8).toUpperCase()}`;
        const gender = genderRaw.toLowerCase().startsWith("f") ? "FEMALE" : "MALE";

        const existingApp = await prisma.studentApplication.findFirst({
          where: { schoolId, aadharNo: aadhaarNo },
          select: { id: true, studentId: true },
        });

        const commonUpdate = {
          classId,
          className: className || null,
          section: section || null,
          totalFee,
          discountPercent,
          applicationFee:
            applicationFee != null && Number.isFinite(applicationFee) ? applicationFee : null,
          admissionFee: admissionFee != null && Number.isFinite(admissionFee) ? admissionFee : null,
          rollNo: rollNo || null,
          parentName: fatherName,
          parentPhone: phoneNo,
          parentEmail: email || undefined,
          previousSchoolName: previousSchool || undefined,
        };

        const app = existingApp
          ? await prisma.studentApplication.update({
              where: { id: existingApp.id },
              data: commonUpdate,
              select: { id: true, studentId: true },
            })
          : await prisma.studentApplication.create({
              data: {
                schoolId,
                classId,
                className: className || null,
                section: section || null,
                applicationNo,
                gradeSought: "GRADE_1",
                boardingType: "SEMI_RESIDENTIAL",
                totalFee,
                discountPercent,
                applicationFee:
                  applicationFee != null && Number.isFinite(applicationFee) ? applicationFee : null,
                admissionFee:
                  admissionFee != null && Number.isFinite(admissionFee) ? admissionFee : null,
                rollNo: rollNo || null,
                firstName,
                middleName,
                lastName,
                gender,
                dateOfBirth: dobDate,
                aadharNo: aadhaarNo,
                firstLanguage: "English",
                nationality: "Indian",
                languagesAtHome: "English",
                houseNo: address || "-",
                street: "-",
                city: "-",
                state: "-",
                pinCode: "-",
                parentName: fatherName,
                parentOccupation: "-",
                officeAddress: "-",
                parentPhone: phoneNo,
                parentEmail: email || `${emailLocalPartFromFullName(name)}@${schoolDomain}`,
                parentAadharNo: `${aadhaarNo.slice(0, 8)}0000`,
                parentWhatsapp: phoneNo,
                bankAccountNo: "-",
                previousSchoolName: previousSchool || "-",
                previousSchoolAddress: "-",
                emergencyFatherNo: phoneNo,
                emergencyMotherNo: phoneNo,
                emergencyGuardianNo: phoneNo,
              },
              select: { id: true, studentId: true },
            });

        createdApplications.push({ row: i + 2, applicationId: app.id, aadhaarNo });

        if (!createStudents) continue;
        if (app.studentId) continue; // already converted

        // Convert to student + create user access
        const student = await prisma.$transaction(async (tx) => {
          // admission number counter
          let settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
          if (!settings) {
            settings = await tx.schoolSettings.create({
              data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0, defaultInstallments: schoolDefaultInstallments } as any,
            });
          }

          const updated = await tx.schoolSettings.update({
            where: { schoolId },
            data: { admissionCounter: { increment: 1 } },
            select: { admissionPrefix: true, rollNoPrefix: true, admissionCounter: true, defaultInstallments: true } as any,
          });
          const nextNum = updated.admissionCounter;
          const defaultInstallments =
            Number.isInteger((updated as any).defaultInstallments) && (updated as any).defaultInstallments > 0
              ? (updated as any).defaultInstallments
              : schoolDefaultInstallments;
          const admissionNumber = `${updated.admissionPrefix}/${year}/${String(nextNum).padStart(3, "0")}`;

          const password = dobDate.toISOString().split("T")[0].replace(/-/g, "");
          const hashedPassword = await bcrypt.hash(password, 10);

          const local = emailLocalPartFromFullName(name);
          let userEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : `${local}@${schoolDomain}`;
          let counter = 1;
          while (await tx.user.findUnique({ where: { email: userEmail }, select: { id: true } })) {
            userEmail = `${local}.${counter}@${schoolDomain}`;
            counter++;
            if (counter > 1000) throw new Error("Unable to generate unique email");
          }

          const user = await tx.user.create({
            data: { name, email: userEmail, password: hashedPassword, role: Role.STUDENT, schoolId },
          });

          const studentRecord = await tx.student.create({
            data: {
              userId: user.id,
              schoolId,
              admissionNumber,
              classId,
              dob: dobDate,
              address: address || null,
              gender: genderRaw || null,
              previousSchool: previousSchool || null,
              fatherName,
              aadhaarNo,
              phoneNo,
              rollNo: rollNo || (updated.rollNoPrefix ? `${updated.rollNoPrefix}${nextNum}` : String(nextNum)),
            },
          });

          if (totalFee != null) {
            const disc = discountPercent ?? 0;
            const finalFee = totalFee * (1 - disc / 100);
            await tx.studentFee.create({
              data: {
                studentId: studentRecord.id,
                totalFee,
                discountPercent: disc,
                finalFee,
                amountPaid: 0,
                remainingFee: finalFee,
                installments: defaultInstallments,
              },
            });
          }

          await tx.studentApplication.update({ where: { id: app.id }, data: { studentId: studentRecord.id } });
          return studentRecord;
        });

        convertedStudents.push({ row: i + 2, studentId: student.id });
      } catch (e: any) {
        failed.push({ row: i + 2, error: e?.message || "Unknown error" });
      }
    }

    return NextResponse.json(
      {
        message: "Admission bulk upload completed",
        createdApplications: createdApplications.length,
        convertedStudents: convertedStudents.length,
        failedCount: failed.length,
        failed: failed.slice(0, 50),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || "Internal server error" }, { status: 500 });
  }
}

