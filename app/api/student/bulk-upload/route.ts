import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";
import { randomUUID } from "crypto";

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

function generateSyntheticAadhaar(rowNumber: number) {
  const digits = `${Date.now()}${rowNumber}${Math.floor(Math.random() * 1_000_000)}`.replace(
    /\D/g,
    ""
  );
  return digits.slice(-12).padStart(12, "0");
}

function normalizeTimellyNo(value: unknown) {
  return toStr(value).replace(/\s+/g, "").toUpperCase();
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
  const ddmmyyyy = normalizedDob.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    const dt = new Date(year, month - 1, day);
    if (
      !Number.isNaN(dt.getTime()) &&
      dt.getDate() === day &&
      dt.getMonth() === month - 1 &&
      dt.getFullYear() === year
    ) {
      return dt;
    }
  }
  const dt = new Date(normalizedDob);
  if (Number.isNaN(dt.getTime())) {
    throw new Error("Invalid date of birth");
  }
  return dt;
}

function formatDobPassword(dob: Date) {
  const yyyy = dob.getFullYear();
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const dd = String(dob.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function buildName(row: Record<string, unknown>) {
  const compactName = toStr(row.name ?? row["Student Name"]);
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
      prisma.schoolSettings.findUnique({
        where: { schoolId },
        select: {
          emailDomain: true,
          defaultInstallments: true,
          admissionPrefix: true,
          rollNoPrefix: true,
        } as any,
      }),
    ]);
    const schoolDomain =
      normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");
    const schoolDefaultInstallments =
      Number.isInteger((settings as any)?.defaultInstallments) && (settings as any).defaultInstallments > 0
        ? (settings as any).defaultInstallments
        : 3;
    const admissionPrefix = (settings as any)?.admissionPrefix || "ADM";
    const rollNoPrefix = (settings as any)?.rollNoPrefix || "";
    const verboseLog = process.env.STUDENT_BULK_UPLOAD_VERBOSE === "true";
    const bcryptRoundsRaw = Number(process.env.STUDENT_BULK_UPLOAD_BCRYPT_ROUNDS ?? 4);
    const bcryptRounds = Number.isFinite(bcryptRoundsRaw)
      ? Math.min(10, Math.max(4, Math.trunc(bcryptRoundsRaw)))
      : 6;
    const hashCache = new Map<string, string>();

    const classLookup = new Map<string, string>();
    for (const c of classes) {
      const key = `${(c.name || "").trim().toLowerCase()}::${(c.section || "")
        .trim()
        .toLowerCase()}`;
      classLookup.set(key, c.id);
      if (!(c.section || "").trim()) {
        const classOnlyKey = `${(c.name || "").trim().toLowerCase()}::`;
        if (!classLookup.has(classOnlyKey)) classLookup.set(classOnlyKey, c.id);
      }
    }

    const year = new Date().getFullYear();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        const name = buildName(row);
        const fatherName = toStr(
          row.fatherName ??
            row.parentName ??
            row["Parent Name"] ??
            row["Parent/Guardian Name"]
        );
        const phoneNo = normalizePhone(
          row.phoneNo ??
            row.contactNumber ??
            row.parentPhone ??
            row["Parent Phone"] ??
            row["Primary Phone"]
        );
        let aadhaarNo = normalizeAadhaar(
          row.aadhaarNo ?? row.aadharNo ?? row.aadhaarNoRaw ?? row["Aadhar No"]
        );
        if (!aadhaarNo) {
          aadhaarNo = generateSyntheticAadhaar(rowNumber);
        }
        const address = buildAddress(row) || null;
        const gender = normalizeGender(row.gender ?? row.Gender);
        const previousSchool =
          toStr(row.previousSchool ?? row.previousSchoolName ?? row["Previous School Name"]) ||
          null;
        const totalFee = parseOptionalNumber(row.totalFee ?? row["Total Fee"]);
        const discountPercent = parseOptionalNumber(
          row.discountPercent ?? row["Discount %"] ?? 0
        );
        const applicationFee = parseOptionalNumber(
          row.applicationFee ?? row["Application Fee"]
        );
        const admissionFee = parseOptionalNumber(row.admissionFee ?? row["Admission Fee"]);
        const residencyType = normalizeResidencyType(
          row.residencyType ??
            row["Residency Type"] ??
            row["Student Category"] ??
            row.residency ??
            "Day Scholar"
        );
        const rawDob = row.dob ?? row.dateOfBirth ?? row["Date of Birth"];
        const timellyNo = normalizeTimellyNo(
          row.timellyNo ?? row["Timelly No"] ?? row["Timely No"]
        );

        if (verboseLog) {
          console.log("[student bulk upload] Parsed row", {
            row: rowNumber,
            name,
            fatherName,
            phoneNo,
            aadhaarNo,
            gender,
            previousSchool,
            totalFee,
            discountPercent,
            rawDob,
            className: toStr(row.class ?? row.className ?? row.Class),
            section: toStr(row.section ?? row.Section),
            email: toStr(row.email ?? row.parentEmail ?? row["Parent Email"]) || null,
            address,
            timellyNo: timellyNo || null,
          });
        }

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
          throw new Error("Aadhaar number is invalid");
        }
        if (totalFee != null && (!Number.isFinite(totalFee) || totalFee <= 0)) {
          throw new Error("totalFee must be a positive number");
        }
        if (
          discountPercent == null ||
          !Number.isFinite(discountPercent) ||
          discountPercent < 0 ||
          discountPercent > 100
        ) {
          throw new Error("discountPercent must be between 0 and 100");
        }

        const dobDate = parseDob(rawDob);

        const existingStudent = await prisma.student.findFirst({
          where: { schoolId, aadhaarNo },
          select: { id: true, userId: true, schoolId: true },
        });

        // Optional: Class + Section mapping — if not found, student is created unassigned
        const className = toStr(row.class ?? row.className ?? row.Class);
        const section = toStr(row.section ?? row.Section);
        let classId: string | null = null;
        if (className) {
          const keyWithSection = `${className.trim().toLowerCase()}::${section
            .trim()
            .toLowerCase()}`;
          const keyClassOnly = `${className.trim().toLowerCase()}::`;
          classId = classLookup.get(keyWithSection) || classLookup.get(keyClassOnly) || null;
          // If no match, leave classId null (unassigned) instead of throwing
        }

        // Each student is created in its own short transaction
        await prisma.$transaction(
          async (tx) => {
            const nameLocalPart = emailLocalPartFromFullName(name);
            // Student login email is always name@schoolDomain — CSV/row "email" is parent contact only, not User.email.
            let userEmail = `${nameLocalPart}@${schoolDomain}`;

            const password = formatDobPassword(dobDate);
            let hashedPassword = hashCache.get(password);
            if (!hashedPassword) {
              hashedPassword = await bcrypt.hash(password, bcryptRounds);
              hashCache.set(password, hashedPassword);
            }

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
                },
              });

              const student = await tx.student.update({
                where: { id: existingStudent.id },
                data: {
                  rollNo: timellyNo
                    ? timellyNo
                    : toStr(
                        row.rollNo ??
                          row.studentId ??
                          row["Admission No"] ??
                          row["Application No"]
                      ) || undefined,
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

              if (totalFee != null) {
                const finalFee = Number(
                  (totalFee * (1 - discountPercent / 100)).toFixed(2)
                );

                await tx.studentFee.upsert({
                  where: { studentId: student.id },
                  update: {
                    totalFee,
                    discountPercent,
                    finalFee,
                    remainingFee: finalFee,
                  },
                  create: {
                    studentId: student.id,
                    totalFee,
                    discountPercent,
                    finalFee,
                    amountPaid: 0,
                    remainingFee: finalFee,
                    installments: schoolDefaultInstallments,
                  },
                });
              }

              return;
            }

            let admissionNumber = "";
            if (timellyNo) {
              const preferredAdmission = `${admissionPrefix}/${year}/${timellyNo}`;
              const existingPreferred = await tx.student.findUnique({
                where: { admissionNumber: preferredAdmission },
                select: { id: true },
              });
              if (!existingPreferred) {
                admissionNumber = preferredAdmission;
              } else {
                const fallbackWithSuffix = `${preferredAdmission}-${randomUUID()
                  .replace(/-/g, "")
                  .slice(0, 4)
                  .toUpperCase()}`;
                admissionNumber = fallbackWithSuffix;
              }
            } else {
              admissionNumber = `${admissionPrefix}/${year}/R${randomUUID()
                .replace(/-/g, "")
                .slice(0, 10)
                .toUpperCase()}`;
            }

            const defaultInstallments = schoolDefaultInstallments;

            const rawRollNo =
              row.rollNo ?? row.studentId ?? row["Admission No"] ?? row["Application No"] ?? "";
            const finalRollNo =
              timellyNo
                ? timellyNo
                : typeof rawRollNo === "string" && rawRollNo.trim()
                ? rawRollNo.trim()
                : rollNoPrefix
                ? `${rollNoPrefix}${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
                : `R${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

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

            if (totalFee != null) {
              const finalFee = Number(
                (totalFee * (1 - discountPercent / 100)).toFixed(2)
              );

              await tx.studentFee.create({
                data: {
                  studentId: student.id,
                  totalFee,
                  discountPercent,
                  finalFee,
                  amountPaid: 0,
                  remainingFee: finalFee,
                  installments: defaultInstallments,
                },
              });
            }
          },
          {
            maxWait: 10000,
            timeout: 30000,
          }
        );

        if (verboseLog) {
          console.log("[student bulk upload] Created student successfully", {
            row: rowNumber,
            name,
          });
        }

        created.push({ row: rowNumber, name });
      } catch (err: any) {
        if (verboseLog) {
          console.error("[student bulk upload] Failed row", {
            row: rowNumber,
            error: err?.message || "Unknown error while creating student",
            rawRow: row,
          });
        }

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
      failedPreview: failed.slice(0, 10),
    });

  } catch (err: any) {
    console.error("Bulk upload error", err);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
