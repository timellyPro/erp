import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { setApplicationEnrolled } from "@/lib/admissionsListQuery";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";
import { upsertStudentFeeFromStructure } from "@/lib/studentTuitionFromStructure";
import { buildAddressFromParts } from "@/lib/studentAddressFormat";

function normalizePhone10(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length > 10) return d.slice(-10);
  return "";
}

function timellyFromApplication(rollNo: string | null, fedenaNo: string | null) {
  const raw = (rollNo || fedenaNo || "").trim();
  if (!raw) return null;
  if (raw.includes("/")) {
    const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || null;
  }
  return raw;
}

function buildFullName(first: string, middle: string | null, last: string) {
  return [first, middle, last].filter(Boolean).join(" ").trim();
}

function buildAddressFromApplication(app: {
  houseNo: string;
  street: string;
  town: string | null;
  city: string;
  state: string;
  pinCode: string;
}) {
  return buildAddressFromParts([app.houseNo, app.street, app.town, app.city, app.state, app.pinCode]);
}

/**
 * Creates a school Student + User from an admission application and links the application.
 * Caller must verify tenant (schoolId) and permissions.
 */
export async function enrollStudentFromAdmissionApplication(params: {
  applicationId: string;
  schoolId: string;
}): Promise<{ studentId: string }> {
  const { applicationId, schoolId } = params;

  // Explicit columns only (no workflowStatus) so this works before the workflow migration is applied.
  const appRows = await prisma.$queryRaw<
    Array<{
      studentId: string | null;
      classId: string | null;
      firstName: string;
      middleName: string | null;
      lastName: string;
      parentPhone: string;
      aadharNo: string;
      parentName: string;
      motherName: string | null;
      dateOfBirth: Date;
      gender: string;
      previousSchoolName: string;
      rollNo: string | null;
      penNumber: string | null;
      apaarId: string | null;
      fedenaNo: string | null;
      houseNo: string;
      street: string;
      town: string | null;
      city: string;
      state: string;
      pinCode: string;
      parentEmail: string;
      residencyType: string;
      applicationFee: number | null;
      admissionFee: number | null;
      parentOccupation: string;
    }>
  >(
    Prisma.sql`SELECT "studentId", "classId", "firstName", "middleName", "lastName", "parentPhone", "aadharNo", "parentName", "motherName", "dateOfBirth", "gender", "previousSchoolName", "rollNo", "penNumber", "apaarId", "fedenaNo", "houseNo", "street", "town", "city", "state", "pinCode", "parentEmail", "residencyType", "applicationFee", "admissionFee", "parentOccupation" FROM "StudentApplication" WHERE "id" = ${applicationId} AND "schoolId" = ${schoolId} LIMIT 1`
  );
  const app = appRows[0];

  if (!app) {
    const err = new Error("Admission application not found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }

  if (app.studentId) {
    const err = new Error("This application is already enrolled as a student");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  if (!app.classId) {
    const err = new Error("Assign a class to this application before approving enrollment.");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const classRow = await prisma.class.findFirst({
    where: { id: app.classId, schoolId },
    select: { id: true, section: true },
  });
  if (!classRow) {
    const err = new Error("Class not found or does not belong to your school");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const name = buildFullName(app.firstName, app.middleName, app.lastName);
  if (!name || name.length < 2) {
    const err = new Error("Student name is required");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const phoneNo = normalizePhone10(app.parentPhone);
  if (!/^\d{10}$/.test(phoneNo)) {
    const err = new Error("Parent phone must contain 10 digits");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const aadhaarCleaned = String(app.aadharNo).replace(/[\s-]/g, "");
  if (aadhaarCleaned.length < 12) {
    const err = new Error("Aadhaar on the application must be at least 12 characters for enrollment");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const existingAadhaar = await prisma.student.findFirst({
    where: { schoolId, aadhaarNo: aadhaarCleaned },
    select: { id: true },
  });
  if (existingAadhaar) {
    const err = new Error("A student with this Aadhaar number already exists in your school");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const fatherName = app.parentName.trim();
  if (fatherName.length < 2) {
    const err = new Error("Parent name is required");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const dobDate = app.dateOfBirth;
  const genderRaw = app.gender === "FEMALE" ? "Female" : "Male";
  const address = buildAddressFromApplication(app) || null;
  const previousSchool = app.previousSchoolName?.trim() || null;
  const classId = app.classId;
  const rollInput = timellyFromApplication(app.rollNo, app.fedenaNo);

  const normalizedStudentName = name.trim();
  if (rollInput) {
    const duplicateTimellyId = await prisma.student.findFirst({
      where: { schoolId, rollNo: rollInput },
      include: { user: { select: { name: true } } },
    });
    if (duplicateTimellyId) {
      const existingName = duplicateTimellyId.user?.name?.trim() || "";
      if (existingName && existingName.toLowerCase() === normalizedStudentName.toLowerCase()) {
        const err = new Error("Student name and Timelly ID already exist");
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      const err = new Error("Timelly ID already exists");
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }
  }

  const [school, settings] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.schoolSettings.findUnique({ where: { schoolId }, select: { emailDomain: true } }),
  ]);
  const schoolDomain =
    normalizeEmailDomain(settings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");
  const year = new Date().getFullYear();

  const password = dobDate.toISOString().split("T")[0].replace(/-/g, "");
  const hashedPassword = await bcrypt.hash(password, 10);

  const parentEmailRaw = (app.parentEmail || "").trim();
  const emailForUser =
    parentEmailRaw && parentEmailRaw !== "-" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmailRaw)
      ? parentEmailRaw
      : "";

  const studentRecord = await prisma.$transaction(
    async (tx) => {
      let settingsRow = await tx.schoolSettings.findUnique({ where: { schoolId } });
      if (!settingsRow) {
        settingsRow = await tx.schoolSettings.create({
          data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0 },
        });
      }

      let nextNum = 0;
      let updated: { admissionPrefix: string; rollNoPrefix: string; admissionCounter: number } | null = null;
      let admissionNumber = "";
      const timellyId = rollInput;

      if (timellyId) {
        const current = await tx.schoolSettings.findUnique({
          where: { schoolId },
          select: { admissionPrefix: true, rollNoPrefix: true, admissionCounter: true },
        });
        if (!current) throw new Error("School settings not found while generating admission number.");
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
            const token = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
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
      let userEmail = emailForUser || `${local}@${schoolDomain}`;
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

      const finalRollNo =
        rollInput ||
        (updated!.rollNoPrefix ? `${updated!.rollNoPrefix}${nextNum}` : String(nextNum));

      const student = await tx.student.create({
        data: {
          userId: user.id,
          schoolId,
          admissionNumber,
          classId,
          dob: dobDate,
          address,
          gender: genderRaw,
          previousSchool,
          fatherName,
          motherName: app.motherName?.trim() || null,
          occupation: app.parentOccupation?.trim() || null,
          aadhaarNo: aadhaarCleaned,
          phoneNo,
          rollNo: finalRollNo,
          penNumber: app.penNumber?.trim() || null,
          apaarId: app.apaarId?.trim() || null,
          residencyType: app.residencyType || "Day Scholar",
          applicationFee: app.applicationFee ?? null,
          admissionFee: app.admissionFee ?? null,
        },
      });

      const classSection =
        (await tx.class.findUnique({ where: { id: classId }, select: { section: true } }))?.section ?? null;

      await upsertStudentFeeFromStructure(tx, {
        schoolId,
        studentId: student.id,
        classId,
        section: classSection,
        discountPercent: 0,
        amountPaid: 0,
      });

      await setApplicationEnrolled(tx, applicationId, student.id, schoolId);

      return student;
    },
    { maxWait: 10000, timeout: 120000 }
  );

  return { studentId: studentRecord.id };
}
