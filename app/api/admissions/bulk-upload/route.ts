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
import { setApplicationEnrolled } from "@/lib/admissionsListQuery";
import { upsertStudentFeeFromStructure } from "@/lib/studentTuitionFromStructure";

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

function buildName(row: Record<string, unknown>) {
  const compactName = toStr(row.name);
  if (compactName) return compactName;
  const firstName = toStr(row["First Name"]);
  const middleName = toStr(row["Middle Name"]);
  const lastName = toStr(row["Last Name"]);
  return [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
}

function extractTimellyId(row: Record<string, unknown>) {
  const rawId = toStr(
    row.rollNo ??
      row.studentId ??
      row.admissionNo ??
      row["Admission No"] ??
      row["Student ID"] ??
      row["Roll No"] ??
      row["Timelly Number"] ??
      row["Timelly No"] ??
      row["Timely Number"] ??
      row["Timely No"]
  );
  if (!rawId) return "";
  if (rawId.includes("/")) {
    const parts = rawId.split("/").map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || "";
  }
  return rawId;
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
      prisma.schoolSettings.findUnique({ where: { schoolId }, select: { emailDomain: true } }),
    ]);
    const schoolDomain =
      normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");
    const year = new Date().getFullYear();

    const createdApplications: any[] = [];
    const convertedStudents: any[] = [];
    const failed: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = buildName(row);
        const fatherName = toStr(row.fatherName ?? row.parentName ?? row["Parent Name"]);
        const rollNo = extractTimellyId(row);
        const phoneNo = normalizePhone(
          row.phoneNo ?? row.contactNumber ?? row.parentPhone ?? row["Parent Phone"]
        );
        const aadhaarNo = normalizeAadhaar(
          row.aadhaarNo ?? row.aadhaarNoRaw ?? row.aadharNo ?? row["Aadhar No"]
        );
        const genderRaw = toStr(row.gender ?? row.Gender);
        const dobDate = parseDob(row.dob ?? row.dateOfBirth ?? row["Date of Birth"]);
        const previousSchool = toStr(
          row.previousSchool ?? row.previousSchoolName ?? row["Previous School Name"]
        );
        const className = toStr(row.class ?? row.className ?? row.Class);
        const section = toStr(row.section ?? row.Section);
        const applicationFee =
          row.applicationFee === "" || row.applicationFee == null || row["Application Fee"] === ""
            ? null
            : Number(row.applicationFee ?? row["Application Fee"]);
        const admissionFee =
          row.admissionFee === "" || row.admissionFee == null || row["Admission Fee"] === ""
            ? null
            : Number(row.admissionFee ?? row["Admission Fee"]);
        const email = toStr(row.email ?? row.parentEmail ?? row["Parent Email"]);
        const address =
          toStr(row.address) ||
          [
            toStr(row["House No"]),
            toStr(row.Street),
            toStr(row.Town),
            toStr(row.City),
            toStr(row.State),
            toStr(row["Pin Code"]),
          ]
            .filter(Boolean)
            .join(", ");

        if (!name || name.length < 2) throw new Error("Name is required (min 2 characters)");
        if (!fatherName || fatherName.length < 2) throw new Error("Parent name is required (min 2 characters)");
        if (!phoneNo || !/^\d{10}$/.test(phoneNo)) throw new Error("Contact number must be exactly 10 digits");
        if (!aadhaarNo || !/^\d{12}$/.test(aadhaarNo)) throw new Error("Aadhaar number must be exactly 12 digits");
        let classId: string | null = null;
        if (className) {
          const normalizedClass = className.toLowerCase().replace(/\s+/g, "");
          const numericClass = normalizedClass.replace(/[^0-9]/g, "");
          const match = classes.find((c) => {
            const classLabel = (c.name || "").trim().toLowerCase();
            const normalizedLabel = classLabel.replace(/\s+/g, "");
            const numericLabel = normalizedLabel.replace(/[^0-9]/g, "");
            const sameName =
              normalizedLabel === normalizedClass ||
              (numericClass && numericLabel && numericClass === numericLabel);
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
          totalFee: null,
          discountPercent: null,
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
                totalFee: null,
                discountPercent: null,
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
        const password = dobDate.toISOString().split("T")[0].replace(/-/g, "");
        const hashedPassword = await bcrypt.hash(password, 10);

        const student = await prisma.$transaction(async (tx) => {
          // admission number counter
          let settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
          if (!settings) {
            settings = await tx.schoolSettings.create({
              data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0 },
            });
          }

          let nextNum = 0;
          let updated: any = null;
          let admissionNumber = "";
          const timellyId = rollNo || null;
          if (timellyId) {
            const current = await tx.schoolSettings.findUnique({
              where: { schoolId },
              select: { admissionPrefix: true, rollNoPrefix: true, admissionCounter: true },
            });
            if (!current) {
              throw new Error("School settings not found while generating admission number.");
            }
            updated = current;
            admissionNumber = `${updated.admissionPrefix}/${year}/${timellyId}`;
            const existingAdmission = await tx.student.findUnique({
              where: { schoolId_admissionNumber: { schoolId, admissionNumber } },
              select: { id: true },
            });
            if (existingAdmission) {
              throw new Error("This Timelly ID is already used. Please use a different Timelly ID.");
            }
          } else {
            const candidate = await tx.schoolSettings.update({
              where: { schoolId },
              data: { admissionCounter: { increment: 1 } },
              select: { admissionPrefix: true, rollNoPrefix: true, admissionCounter: true },
            });
            nextNum = candidate.admissionCounter;
            updated = candidate;
            admissionNumber = `${candidate.admissionPrefix}/${year}/${String(nextNum).padStart(3, "0")}`;

            const existingAdmission = await tx.student.findUnique({
              where: { schoolId_admissionNumber: { schoolId, admissionNumber } },
              select: { id: true },
            });
            if (existingAdmission) {
              let fallbackReady = false;
              for (let attempt = 0; attempt < 50; attempt++) {
                const token = `${Date.now().toString().slice(-6)}${Math.floor(
                  Math.random() * 900 + 100
                )}`;
                const fallbackAdmissionNo = `${candidate.admissionPrefix}/${year}/${token}`;
                const fallbackExists = await tx.student.findUnique({
                  where: {
                    schoolId_admissionNumber: { schoolId, admissionNumber: fallbackAdmissionNo },
                  },
                  select: { id: true },
                });
                if (!fallbackExists) {
                  admissionNumber = fallbackAdmissionNo;
                  fallbackReady = true;
                  break;
                }
              }
              if (!fallbackReady) {
                throw new Error("Unable to generate admission number. Please try again.");
              }
            }
          }
          const local = emailLocalPartFromFullName(name);
          // Student login email is always name@schoolDomain — CSV email is parent contact only.
          let userEmail = `${local}@${schoolDomain}`;
          let counter = 1;
          while (
            await tx.user.findUnique({
              where: { schoolId_email: { schoolId, email: userEmail } },
              select: { id: true },
            })
          ) {
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

          const classSection =
            classId != null
              ? (
                  await tx.class.findUnique({
                    where: { id: classId },
                    select: { section: true },
                  })
                )?.section ?? null
              : null;
          await upsertStudentFeeFromStructure(tx, {
            schoolId,
            studentId: studentRecord.id,
            classId,
            section: classSection,
            discountPercent: 0,
            amountPaid: 0,
          });

          await setApplicationEnrolled(tx, app.id, studentRecord.id, schoolId);
          return studentRecord;
        }, { maxWait: 10000, timeout: 120000 });

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

