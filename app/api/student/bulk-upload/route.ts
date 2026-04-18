import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";
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

function normalizeGender(value: unknown) {
  const raw = toStr(value);
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("f")) return "Female";
  if (raw.toLowerCase().startsWith("m")) return "Male";
  return raw;
}

function normalizeResidencyType(value: unknown) {
  const raw = toStr(value);
  if (!raw) return "Day Scholar";
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "dayscholar" || normalized === "dayscholer") return "Day Scholar";
  if (normalized === "hostler" || normalized === "hosteler" || normalized === "hosteller" || normalized === "hoster") {
    return "Hosteller";
  }
  return raw;
}

function parseOptionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseDob(rawDob: unknown): Date {
  if (!rawDob) {
    throw new Error("Date of birth (dob) is required");
  }

  if (rawDob instanceof Date) {
    if (Number.isNaN(rawDob.getTime())) {
      throw new Error("Invalid date of birth");
    }
    return rawDob;
  }

  if (typeof rawDob === "number") {
    const d = XLSX.SSF.parse_date_code(rawDob);
    const dt = new Date(d.y, d.m - 1, d.d);
    if (Number.isNaN(dt.getTime())) {
      throw new Error("Invalid date of birth");
    }
    return dt;
  }

  const normalizedDob = toStr(rawDob);
  const dt = new Date(normalizedDob);
  if (Number.isNaN(dt.getTime())) {
    throw new Error("Invalid date of birth");
  }
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

function buildAddress(row: Record<string, unknown>) {
  const compactAddress = toStr(row.address);
  if (compactAddress) return compactAddress;

  const houseNo = toStr(row["House No"]);
  const street = toStr(row.Street);
  const town = toStr(row.Town);
  const city = toStr(row.City);
  const state = toStr(row.State);
  const pinCode = toStr(row["Pin Code"]);

  const locality = [houseNo, street, town, city].filter(Boolean).join(", ");
  const region = [state, pinCode].filter(Boolean).join(" - ");
  return [locality, region].filter(Boolean).join(", ").trim();
}

function extractTimellyId(row: Record<string, unknown>) {
  const rawId = toStr(
    row["Timelly ID"] ??
      row["Timelly Id"] ??
      row.rollNo ??
      row.studentId ??
      row.admissionNo ??
      row.timellyNumber ??
      row.timelyNumber ??
      row["Timelly Number"] ??
      row["Timelly No"] ??
      row["Timely Number"] ??
      row["Timely No"] ??
      row["Admission No"] ??
      row["Student ID"] ??
      row["Roll No"]
  );
  if (!rawId) return "";
  // Support admission-export style values like ADM/2026/123 by extracting last segment.
  if (rawId.includes("/")) {
    const parts = rawId.split("/").map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || "";
  }
  return rawId;
}

function normalizeStudentName(value: unknown) {
  return toStr(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let schoolId = session.user.schoolId;

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

    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    /* ================= EXCEL ================= */

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ message: "Excel file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return NextResponse.json({ message: "Excel empty" }, { status: 400 });
    }

    const created: any[] = [];
    const failed: any[] = [];

    // Preload classes once so we can map Class + Section -> classId
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        const name = buildName(row);
        const fatherName = toStr(
          row.fatherName ?? row.parentName ?? row["Parent Name"]
        );
        const phoneNo = normalizePhone(
          row.phoneNo ?? row.contactNumber ?? row.parentPhone ?? row["Parent Phone"]
        );
        const aadhaarNo = normalizeAadhaar(
          row.aadhaarNo ?? row.aadharNo ?? row.aadhaarNoRaw ?? row["Aadhar No"]
        );
        const address = buildAddress(row) || null;
        const gender = normalizeGender(row.gender ?? row.Gender);
        const previousSchool =
          toStr(row.previousSchool ?? row.previousSchoolName ?? row["Previous School Name"]) ||
          null;
        const applicationFee = parseOptionalNumber(
          row.applicationFee ?? row["Application Fee"]
        );
        const admissionFee = parseOptionalNumber(row.admissionFee ?? row["Admission Fee"]);
        const residencyType = normalizeResidencyType(
          row.residencyType ?? row["Residency Type"] ?? row.residency ?? "Day Scholar"
        );
        const rawDob = row.dob ?? row.dateOfBirth ?? row["Date of Birth"];

        console.log("[student bulk upload] Parsed row", {
          row: rowNumber,
          name,
          fatherName,
          phoneNo,
          aadhaarNo,
          gender,
          previousSchool,
          rawDob,
          className: toStr(row.class ?? row.className ?? row.Class),
          section: toStr(row.section ?? row.Section),
          email: toStr(row.email ?? row.parentEmail ?? row["Parent Email"]) || null,
          address,
        });

        if (!name || name.length < 2) {
          throw new Error("Name is required (min 2 characters)");
        }
        if (!fatherName || fatherName.length < 2) {
          throw new Error("Parent name is required (min 2 characters)");
        }
        if (!phoneNo || phoneNo.length < 2) {
          throw new Error("Contact number is required");
        }
        if (!aadhaarNo || aadhaarNo.length < 2) {
          throw new Error("Aadhaar number is required");
        }
        const dobDate = parseDob(rawDob);
        const timellyId = extractTimellyId(row);
        const normalizedName = normalizeStudentName(name);

        const existingStudent = await prisma.student.findFirst({
          where: { aadhaarNo },
          select: { id: true, userId: true, schoolId: true },
        });

        if (existingStudent && existingStudent.schoolId !== schoolId) {
          throw new Error("Aadhaar number already exists in another school");
        }

        if (timellyId) {
          const existingByRoll = await prisma.student.findFirst({
            where: { schoolId, rollNo: timellyId },
            select: { id: true, user: { select: { name: true } } },
          });
          if (existingByRoll && existingByRoll.id !== existingStudent?.id) {
            const existingName = normalizeStudentName(existingByRoll.user?.name ?? "");
            if (existingName && existingName === normalizedName) {
              throw new Error("Student name and Timelly ID already exist");
            }
            throw new Error("Timelly ID already exists");
          }
        }

        // Optional: Class + Section mapping — if not found, student is created unassigned
        const className = toStr(row.class ?? row.className ?? row.Class);
        const section = toStr(row.section ?? row.Section);
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
            const sameSection =
              !section ||
              (c.section || "").trim().toLowerCase() === section.toLowerCase();
            return sameName && sameSection;
          });
          if (match) classId = match.id;
          // If no match, leave classId null (unassigned) instead of throwing
        }

        const password = dobDate
          .toISOString()
          .split("T")[0]
          .replace(/-/g, "");
        const hashedPassword = await bcrypt.hash(password, 10);

        // Each student is created in its own short transaction
        await prisma.$transaction(
          async (tx) => {
            const nameLocalPart = emailLocalPartFromFullName(name);
            // Student login email is always name@schoolDomain — CSV/row "email" is parent contact only, not User.email.
            let userEmail = `${nameLocalPart}@${schoolDomain}`;

            if (existingStudent) {
              let existingUser = await tx.user.findUnique({
                where: { email: userEmail },
                select: { id: true },
              });
              if (existingUser && existingUser.id !== existingStudent.userId) {
                let counter = 1;
                do {
                  userEmail = `${nameLocalPart}.${counter}@${schoolDomain}`;
                  existingUser = await tx.user.findUnique({
                    where: { email: userEmail },
                    select: { id: true },
                  });
                  counter++;
                  if (counter > 1000) {
                    throw new Error(
                      "Unable to generate unique email for student. Please try again."
                    );
                  }
                } while (existingUser && existingUser.id !== existingStudent.userId);
              }

              await tx.user.update({
                where: { id: existingStudent.userId },
                data: {
                  name,
                  email: userEmail,
                  password: hashedPassword,
                },
              });

              const student = await tx.student.update({
                where: { id: existingStudent.id },
                data: {
                  rollNo: timellyId || undefined,
                  dob: dobDate,
                  address,
                  fatherName,
                  phoneNo,
                  classId,
                  gender,
                  residencyType,
                  previousSchool,
                  ...(applicationFee !== null && Number.isFinite(applicationFee)
                    ? { applicationFee }
                    : {}),
                  ...(admissionFee !== null && Number.isFinite(admissionFee)
                    ? { admissionFee }
                    : {}),
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
              const feeRow = await tx.studentFee.findUnique({
                where: { studentId: student.id },
                select: { discountPercent: true, amountPaid: true },
              });
              await upsertStudentFeeFromStructure(tx, {
                schoolId,
                studentId: student.id,
                classId,
                section: classSection,
                discountPercent: feeRow?.discountPercent ?? 0,
                amountPaid: feeRow?.amountPaid ?? 0,
              });

              return;
            }

            let settings = await tx.schoolSettings.findUnique({
              where: { schoolId },
            });
            if (!settings) {
              settings = await tx.schoolSettings.create({
                data: {
                  schoolId,
                  admissionPrefix: "ADM",
                  rollNoPrefix: "",
                  admissionCounter: 0,
                },
              });
            }

            const rowTimellyId = timellyId;
            let nextNum = 0;
            let updatedSettings: any = null;
            let admissionNumber = "";

            if (rowTimellyId) {
              updatedSettings = settings;
              admissionNumber = `${settings.admissionPrefix}/${year}/${rowTimellyId}`;
              const existingAdmission = await tx.student.findUnique({
                where: { admissionNumber },
                select: { id: true },
              });
              if (existingAdmission) {
                throw new Error("This Timelly number is already used.");
              }
            } else {
              const candidate = await tx.schoolSettings.update({
                where: { schoolId },
                data: { admissionCounter: { increment: 1 } },
                select: {
                  admissionPrefix: true,
                  rollNoPrefix: true,
                  admissionCounter: true,
                },
              });
              nextNum = candidate.admissionCounter;
              updatedSettings = candidate;
              admissionNumber = `${candidate.admissionPrefix}/${year}/${String(nextNum).padStart(3, "0")}`;

              const existingAdmission = await tx.student.findUnique({
                where: { admissionNumber },
                select: { id: true },
              });

              if (existingAdmission) {
                // Counter may be stale in older databases. Fallback to a unique token
                // without repeated counter updates inside the same transaction.
                let fallbackReady = false;
                for (let attempt = 0; attempt < 50; attempt++) {
                  const token = `${Date.now().toString().slice(-6)}${Math.floor(
                    Math.random() * 900 + 100
                  )}`;
                  const fallbackAdmissionNo = `${candidate.admissionPrefix}/${year}/${token}`;
                  const fallbackExists = await tx.student.findUnique({
                    where: { admissionNumber: fallbackAdmissionNo },
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

            const rollNoPrefix = updatedSettings.rollNoPrefix || "";
            const finalRollNo = rowTimellyId
              ? rowTimellyId
              : rollNoPrefix
              ? `${rollNoPrefix}${nextNum}`
              : String(nextNum);

            let existingUser = await tx.user.findUnique({
              where: { email: userEmail },
              select: { id: true },
            });
            if (existingUser) {
              let counter = 1;
              do {
                userEmail = `${nameLocalPart}.${counter}@${schoolDomain}`;
                existingUser = await tx.user.findUnique({
                  where: { email: userEmail },
                  select: { id: true },
                });
                counter++;
                if (counter > 1000) {
                  throw new Error(
                    "Unable to generate unique email for student. Please try again."
                  );
                }
              } while (existingUser);
            }

            const user = await tx.user.create({
              data: {
                name,
                email: userEmail,
                password: hashedPassword,
                role: Role.STUDENT,
                schoolId,
              },
            });

            const student = await tx.student.create({
              data: {
                userId: user.id,
                schoolId,
                admissionNumber,
                rollNo: finalRollNo,
                dob: dobDate,
                address,
                fatherName,
                aadhaarNo,
                phoneNo,
                classId,
                gender,
                residencyType,
                previousSchool,
                applicationFee:
                  applicationFee != null && Number.isFinite(applicationFee)
                    ? applicationFee
                    : null,
                admissionFee:
                  admissionFee != null && Number.isFinite(admissionFee) ? admissionFee : null,
              },
            });

            const classSectionNew =
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
              studentId: student.id,
              classId,
              section: classSectionNew,
              discountPercent: 0,
              amountPaid: 0,
            });
          },
          {
            maxWait: 10000,
            timeout: 120000,
          }
        );

        console.log("[student bulk upload] Created student successfully", {
          row: rowNumber,
          name,
        });

        created.push({ row: rowNumber, name });
      } catch (err: any) {
        console.error("[student bulk upload] Failed row", {
          row: rowNumber,
          error: err?.message || "Unknown error while creating student",
          rawRow: row,
        });

        failed.push({
          row: rowNumber,
          error: err?.message || "Unknown error while creating student",
        });
      }
    }

    return NextResponse.json({
      message: "Bulk upload completed",
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    });

  } catch (err: any) {
    console.error("Bulk upload error", err);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
