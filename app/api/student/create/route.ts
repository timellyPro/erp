import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { emailLocalPartFromFullName, normalizeEmailDomain, schoolDomainFromName } from "@/lib/schoolEmail";
import { randomUUID } from "crypto";
import {
  computeStudentTuitionTotalFee,
  upsertStudentFeeFromStructure,
} from "@/lib/studentTuitionFromStructure";
import { setApplicationEnrolled } from "@/lib/admissionsListQuery";
import { studentApplicationForStudentCreateSelect } from "@/lib/studentApplicationSafeSelect";

function normalizeResidencyType(value: unknown) {
  if (typeof value !== "string") return "Day Scholar";
  const raw = value.trim();
  if (!raw) return "Day Scholar";
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "dayscholar" || normalized === "dayscholer") return "Day Scholar";
  if (normalized === "hostler" || normalized === "hosteler" || normalized === "hosteller" || normalized === "hoster") {
    return "Hosteller";
  }
  return raw;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.log("Student creation request received");

    let schoolId = session.user.schoolId;

    // Fallback: find school where the admin belongs
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;

      if (schoolId) {
        // persist the school on the user for future requests
        await prisma.user.update({
          where: { id: session.user.id },
          data: { schoolId },
        });
      }
    }

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const body = await req.json();
    console.log("Received student data:", {
      name: body.name,
      fatherName: body.fatherName,
      aadhaarNo: body.aadhaarNo ? "***" : undefined,
      phoneNo: body.phoneNo,
      parentEmail: body.email,
      dob: body.dob,
      classId: body.classId,
    });

    const {
      applicationId,
      name,
      fatherName,
      motherName,
      occupation,
      aadhaarNo,
      phoneNo,
      email: emailInput,
      /** Preferred parent/guardian email; falls back to `email` when omitted */
      parentEmail: parentEmailInput,
      dob,
      classId: classIdInput,
      address: addressInput,
      rollNo,
      penNumber,
      apaarId,
      gender: genderInput,
      previousSchool: previousSchoolInput,
      // Optional admission fields to store alongside the student
      previousSchoolAddress,
      parentOccupation,
      officeAddress,
      parentAadharNo,
      parentWhatsapp,
      bankAccountNo,
      houseNo,
      street,
      city,
      town,
      state,
      pinCode,
      firstLanguage,
      nationality,
      languagesAtHome,
      caste,
      religion,
      emergencyFatherNo,
      emergencyMotherNo,
      emergencyGuardianNo,
      applicationFee: applicationFeeInput,
      admissionFee: admissionFeeInput,
      residencyType: residencyTypeInput,
      status: statusInput,
    } = body;

    const parseOptFee = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    let effectiveName = name;
    let effectiveFatherName = fatherName;
    let effectiveAadhaarNo = aadhaarNo;
    let effectivePhoneNo = phoneNo;
    let effectiveEmailInput =
      typeof parentEmailInput === "string" && parentEmailInput.trim()
        ? parentEmailInput.trim()
        : emailInput;
    let effectiveDob = dob;
    let effectiveClassIdInput = classIdInput;
    let effectiveAddressInput = addressInput;
    let effectiveRollNo = rollNo;
    let effectiveGenderInput = genderInput;
    let effectivePenNumber =
      typeof penNumber === "string" && penNumber.trim() ? penNumber.trim() : null;
    let effectiveApaarId =
      typeof apaarId === "string" && apaarId.trim() ? apaarId.trim() : null;
    let effectiveResidencyType = normalizeResidencyType(residencyTypeInput);
    let effectiveStatus =
      typeof statusInput === "string" && statusInput.trim().toLowerCase() === "inactive"
        ? "Inactive"
        : "Active";
    let effectivePreviousSchoolInput = previousSchoolInput;

    let effectiveApplicationFee = parseOptFee(applicationFeeInput);
    let effectiveAdmissionFee = parseOptFee(admissionFeeInput);

    let applicationToLink: { id: string } | null = null;
    if (typeof applicationId === "string" && applicationId.trim()) {
      const app = await prisma.studentApplication.findFirst({
        where: { id: applicationId.trim(), schoolId },
        select: studentApplicationForStudentCreateSelect,
      });
      if (!app) {
        return NextResponse.json({ message: "Admission application not found" }, { status: 400 });
      }
      if (app.studentId) {
        return NextResponse.json({ message: "This application is already converted to a student" }, { status: 400 });
      }

      const fullName = `${app.firstName} ${app.middleName ? `${app.middleName} ` : ""}${app.lastName}`.trim();
      effectiveName = fullName;
      effectiveFatherName = app.parentName;
      effectiveAadhaarNo = app.aadharNo;
      effectivePhoneNo = app.parentPhone;
      effectiveEmailInput = app.parentEmail;
      effectiveDob = app.dateOfBirth.toISOString();
      effectiveClassIdInput = app.classId ?? null;
      effectiveAddressInput = `${app.houseNo}, ${app.street}, ${app.town ? `${app.town}, ` : ""}${app.city}, ${app.state} - ${app.pinCode}`;
      if (effectiveApplicationFee === null && app.applicationFee != null) {
        effectiveApplicationFee = app.applicationFee;
      }
      if (effectiveAdmissionFee === null && app.admissionFee != null) {
        effectiveAdmissionFee = app.admissionFee;
      }
      effectiveGenderInput = app.gender === "MALE" ? "Male" : "Female";
      effectivePenNumber = (app as { penNumber?: string | null }).penNumber?.trim() || null;
      effectiveApaarId = (app as { apaarId?: string | null }).apaarId?.trim() || null;
      effectiveResidencyType = normalizeResidencyType(app.residencyType);
      effectivePreviousSchoolInput = app.previousSchoolName;
      applicationToLink = { id: app.id };
    }

    if (!applicationToLink) {
      effectiveApplicationFee = null;
      effectiveAdmissionFee = null;
    }

    // Validate all required fields
    if (!effectiveName || typeof effectiveName !== "string" || !effectiveName.trim()) {
      console.error("Validation failed: Student name is required", { name, type: typeof name });
      return NextResponse.json(
        { message: "Student name is required" },
        { status: 400 }
      );
    }
    if (!effectiveDob) {
      console.error("Validation failed: Date of birth is required", { dob, type: typeof dob });
      return NextResponse.json(
        { message: "Date of birth (dob) is required" },
        { status: 400 }
      );
    }
    if (!effectiveFatherName || typeof effectiveFatherName !== "string" || !effectiveFatherName.trim()) {
      console.error("Validation failed: Father's name is required", { fatherName, type: typeof fatherName });
      return NextResponse.json(
        { message: "Father's name is required" },
        { status: 400 }
      );
    }
    if (!effectiveAadhaarNo || typeof effectiveAadhaarNo !== "string" || !effectiveAadhaarNo.trim()) {
      console.error("Validation failed: Aadhaar number is required", { aadhaarNo: aadhaarNo ? "***" : undefined, type: typeof aadhaarNo });
      return NextResponse.json(
        { message: "Aadhaar number is required" },
        { status: 400 }
      );
    }
    if (!effectivePhoneNo || typeof effectivePhoneNo !== "string" || !effectivePhoneNo.trim()) {
      console.error("Validation failed: Phone number is required", { phoneNo, type: typeof phoneNo });
      return NextResponse.json(
        { message: "Phone number is required" },
        { status: 400 }
      );
    }

    // Normalize classId - convert empty string to null
    const classId = effectiveClassIdInput && typeof effectiveClassIdInput === "string" && effectiveClassIdInput.trim() 
      ? effectiveClassIdInput.trim() 
      : null;

    if (!applicationToLink && !classId) {
      return NextResponse.json(
        {
          message:
            "Class is required. Tuition is taken from the global fee structure for that class, not entered here.",
        },
        { status: 400 }
      );
    }

    // Validate DOB is a valid date
    const dobDate = new Date(effectiveDob);
    if (isNaN(dobDate.getTime())) {
      console.error("Validation failed: Invalid date of birth format");
      return NextResponse.json(
        { message: "Invalid date of birth format" },
        { status: 400 }
      );
    }

    // Validate classId if provided
    if (classId) {
      const classExists = await prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, schoolId: true },
      });
      if (!classExists) {
        console.error("Validation failed: Class not found", classId);
        return NextResponse.json(
          { message: "Class not found" },
          { status: 400 }
        );
      }
      if (classExists.schoolId !== schoolId) {
        console.error("Validation failed: Class does not belong to school");
        return NextResponse.json(
          { message: "Class does not belong to your school" },
          { status: 400 }
        );
      }
    }

    const normalizedStudentName = String(effectiveName).trim();
    const normalizedTimellyId =
      typeof effectiveRollNo === "string" ? effectiveRollNo.trim() : "";

    if (normalizedTimellyId) {
      const duplicateTimellyId = await prisma.student.findFirst({
        where: {
          schoolId,
          rollNo: normalizedTimellyId,
        },
        include: {
          user: {
            select: { name: true },
          },
        },
      });

      if (duplicateTimellyId) {
        const existingName = duplicateTimellyId.user?.name?.trim() || "";
        if (
          existingName &&
          existingName.toLowerCase() === normalizedStudentName.toLowerCase()
        ) {
          return NextResponse.json(
            { message: "Student name and Timelly ID already exist" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { message: "Timelly ID already exists" },
          { status: 400 }
        );
      }
    }

    const password = dobDate.toISOString().split("T")[0].replace(/-/g, "");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check for duplicate aadhaar number before transaction
    const aadhaarTrimmed = String(effectiveAadhaarNo).trim();
    // Remove any spaces or dashes from aadhaar number for validation
    const aadhaarCleaned = aadhaarTrimmed.replace(/[\s-]/g, "");
    if (aadhaarCleaned.length < 12) {
      console.error("Validation failed: Aadhaar number must be at least 12 digits", { length: aadhaarCleaned.length });
      return NextResponse.json(
        { message: "Aadhaar number must be at least 12 digits" },
        { status: 400 }
      );
    }
    const existingAadhaar = await prisma.student.findFirst({
      where: { schoolId, aadhaarNo: aadhaarCleaned },
      select: { id: true },
    });
    if (existingAadhaar) {
      console.error("Validation failed: Aadhaar number already exists");
      return NextResponse.json(
        { message: "Aadhaar number already exists" },
        { status: 400 }
      );
    }

    const student = await prisma.$transaction(
      async (tx) => {
        const [school, emailSettings] = await Promise.all([
          tx.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
          tx.schoolSettings.findUnique({ where: { schoolId }, select: { emailDomain: true } }),
        ]);
        const schoolDomain =
          normalizeEmailDomain(emailSettings?.emailDomain) ?? schoolDomainFromName(school?.name ?? "school");

        const year = new Date().getFullYear();
        let settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
        if (!settings) {
          settings = await tx.schoolSettings.create({
            data: { schoolId, admissionPrefix: "ADM", rollNoPrefix: "", admissionCounter: 0 },
          });
        }
        let nextNum = 0;
        let admissionNumber = "";
        const timellyId =
          typeof effectiveRollNo === "string" && effectiveRollNo.trim()
            ? effectiveRollNo.trim()
            : null;

        if (timellyId) {
          admissionNumber = `${settings.admissionPrefix}/${year}/${timellyId}`;
          const existingAdmission = await tx.student.findUnique({
            where: { admissionNumber },
            select: { id: true },
          });
          if (existingAdmission) {
            throw new Error("This Timelly ID is already used. Please enter a different Timelly ID.");
          }
        } else {
          let admissionNumberReady = false;
          // Generate admission number with atomic counter increments + retry.
          // This heals stale counters and avoids race-condition conflicts.
          // Keep retrying for a larger window so stale counters don't block creation
          // when many existing admissions already occupy early numbers.
          for (let attempt = 0; attempt < 1000; attempt++) {
            const updatedSettings = await tx.schoolSettings.update({
              where: { schoolId },
              data: { admissionCounter: { increment: 1 } },
              select: { admissionCounter: true, admissionPrefix: true },
            });
            nextNum = updatedSettings.admissionCounter;
            admissionNumber = `${updatedSettings.admissionPrefix}/${year}/${String(nextNum).padStart(3, "0")}`;

            const existingAdmission = await tx.student.findUnique({
              where: { admissionNumber },
              select: { id: true },
            });
            if (!existingAdmission) {
              admissionNumberReady = true;
              break;
            }
          }
          if (!admissionNumberReady) {
            throw new Error("Unable to generate admission number. Please try again.");
          }
        }

        const rollNoPrefix = settings.rollNoPrefix || "";
        const finalRollNo =
          typeof rollNo === "string" && rollNo.trim()
            ? rollNo.trim()
            : rollNoPrefix
              ? `${rollNoPrefix}${nextNum}`
              : String(nextNum);

        /** Parent/guardian contact email from the form — never used as the student's login email. */
        const parentContactEmail =
          typeof effectiveEmailInput === "string" && effectiveEmailInput.trim().length > 0
            ? effectiveEmailInput.trim()
            : null;

        const nameLocal = emailLocalPartFromFullName(effectiveName);
        // Student User.email is always derived from the student's name + school domain (never parent email).
        let userEmail = `${nameLocal}@${schoolDomain}`;

        // Check if email already exists and generate alternative if needed
        let existingUser = await tx.user.findUnique({
          where: { email: userEmail },
          select: { id: true },
        });
        if (existingUser) {
          // Generate alternative email if conflict
          let counter = 1;
          do {
            userEmail = `${nameLocal}.${counter}@${schoolDomain}`;
            existingUser = await tx.user.findUnique({
              where: { email: userEmail },
              select: { id: true },
            });
            counter++;
            if (counter > 1000) {
              throw new Error("Unable to generate unique email. Please try again.");
            }
          } while (existingUser);
        }

        const user = await tx.user.create({
          data: {
            name: effectiveName,
            email: userEmail,
            password: hashedPassword,
            role: Role.STUDENT,
            schoolId,
          },
        });

        const address =
          typeof effectiveAddressInput === "string" && effectiveAddressInput.trim()
            ? effectiveAddressInput.trim()
            : null;
        const gender =
          typeof effectiveGenderInput === "string" && effectiveGenderInput.trim()
            ? effectiveGenderInput.trim()
            : null;
        const previousSchool =
          typeof effectivePreviousSchoolInput === "string" && effectivePreviousSchoolInput.trim()
            ? effectivePreviousSchoolInput.trim()
            : null;

        const studentRecord = await tx.student.create({
          data: {
            userId: user.id,
            schoolId,
            admissionNumber,
            classId: classId ?? null,
            dob: dobDate,
            address,
            gender,
            previousSchool,
            fatherName: String(effectiveFatherName).trim(),
            motherName:
              typeof motherName === "string" && motherName.trim()
                ? motherName.trim()
                : null,
            occupation:
              typeof occupation === "string" && occupation.trim()
                ? occupation.trim()
                : typeof parentOccupation === "string" && parentOccupation.trim()
                ? parentOccupation.trim()
                : null,
            aadhaarNo: aadhaarCleaned,
            phoneNo: String(effectivePhoneNo).trim(),
            residencyType: effectiveResidencyType,
            status: effectiveStatus,
            rollNo:
              typeof effectiveRollNo === "string" && effectiveRollNo.trim()
                ? effectiveRollNo.trim()
                : finalRollNo,
            penNumber: effectivePenNumber,
            apaarId: effectiveApaarId,
            applicationFee: effectiveApplicationFee,
            admissionFee: effectiveAdmissionFee,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            class: true,
          },
        });

        if (applicationToLink) {
          await setApplicationEnrolled(tx, applicationToLink.id, studentRecord.id, schoolId);
        }

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

        const tuitionSnapshot = await computeStudentTuitionTotalFee(tx, {
          schoolId,
          classId,
          section: classSection,
          studentId: studentRecord.id,
        });

        // Create (or link) StudentApplication to keep all admission fields for this student.
        // This lets the "Student creation section" store full admission data without expanding Student table.
        if (!applicationToLink) {
          const classRow = classId
            ? await tx.class.findUnique({ where: { id: classId }, select: { name: true, section: true } })
            : null;

          const year2 = new Date().getFullYear();
          // Keep mixed case from UUID slice (no forced uppercase).
          const appNo = `APP/${year2}/${randomUUID().slice(0, 8)}`;
          const generatedParentAadharNo = `${aadhaarCleaned}${String(Date.now()).slice(-4)}`;

          await tx.studentApplication.create({
            data: {
              schoolId,
              classId: classId ?? null,
              className: classRow?.name ?? null,
              section: classRow?.section ?? null,
              studentId: studentRecord.id,
              applicationNo: appNo,
              fedenaNo: null,
              admissionNo: null,
              gradeSought: "GRADE_1",
              boardingType: "SEMI_RESIDENTIAL",
              residencyType: effectiveResidencyType,
              totalFee: tuitionSnapshot,
              discountPercent: 0,
              applicationFee: effectiveApplicationFee,
              admissionFee: effectiveAdmissionFee,
              rollNo: typeof effectiveRollNo === "string" && effectiveRollNo.trim() ? effectiveRollNo.trim() : null,
              penNumber: effectivePenNumber,
              apaarId: effectiveApaarId,
              firstName: String(effectiveName).split(" ")[0] || "Student",
              middleName: null,
              lastName: String(effectiveName).split(" ").slice(1).join(" ") || "Student",
              gender: String(effectiveGenderInput || "Male").toLowerCase().startsWith("f") ? "FEMALE" : "MALE",
              dateOfBirth: dobDate,
              aadharNo: aadhaarCleaned,
              firstLanguage: typeof firstLanguage === "string" && firstLanguage.trim() ? firstLanguage.trim() : "English",
              nationality: typeof nationality === "string" && nationality.trim() ? nationality.trim() : "Indian",
              languagesAtHome:
                typeof languagesAtHome === "string" && languagesAtHome.trim() ? languagesAtHome.trim() : "English",
              caste: typeof caste === "string" && caste.trim() ? caste.trim() : null,
              religion: typeof religion === "string" && religion.trim() ? religion.trim() : null,
              houseNo: typeof houseNo === "string" && houseNo.trim() ? houseNo.trim() : (typeof effectiveAddressInput === "string" && effectiveAddressInput.trim() ? effectiveAddressInput.trim() : "-"),
              street: typeof street === "string" && street.trim() ? street.trim() : "-",
              city: typeof city === "string" && city.trim() ? city.trim() : "-",
              town: typeof town === "string" && town.trim() ? town.trim() : null,
              state: typeof state === "string" && state.trim() ? state.trim() : "-",
              pinCode: typeof pinCode === "string" && pinCode.trim() ? pinCode.trim() : "-",
              parentName: String(effectiveFatherName).trim(),
              parentOccupation: typeof parentOccupation === "string" && parentOccupation.trim() ? parentOccupation.trim() : "-",
              officeAddress: typeof officeAddress === "string" && officeAddress.trim() ? officeAddress.trim() : "-",
              parentPhone: String(effectivePhoneNo).trim(),
              parentEmail:
                parentContactEmail ??
                `parent.${nameLocal}.${timellyId ?? nextNum}@${schoolDomain}`,
              parentAadharNo:
                typeof parentAadharNo === "string" && parentAadharNo.trim()
                  ? parentAadharNo.trim()
                  : generatedParentAadharNo,
              parentWhatsapp: typeof parentWhatsapp === "string" && parentWhatsapp.trim() ? parentWhatsapp.trim() : String(effectivePhoneNo).trim(),
              bankAccountNo: typeof bankAccountNo === "string" && bankAccountNo.trim() ? bankAccountNo.trim() : "-",
              previousSchoolName: typeof effectivePreviousSchoolInput === "string" && effectivePreviousSchoolInput.trim() ? effectivePreviousSchoolInput.trim() : "-",
              previousSchoolAddress: typeof previousSchoolAddress === "string" && previousSchoolAddress.trim() ? previousSchoolAddress.trim() : "-",
              emergencyFatherNo: typeof emergencyFatherNo === "string" && emergencyFatherNo.trim() ? emergencyFatherNo.trim() : String(effectivePhoneNo).trim(),
              emergencyMotherNo: typeof emergencyMotherNo === "string" && emergencyMotherNo.trim() ? emergencyMotherNo.trim() : String(effectivePhoneNo).trim(),
              emergencyGuardianNo: typeof emergencyGuardianNo === "string" && emergencyGuardianNo.trim() ? emergencyGuardianNo.trim() : String(effectivePhoneNo).trim(),
            },
          });
        }

        return studentRecord;
      },
      {
        maxWait: 15000,
        timeout: 45000, // Large create (user + student + fee + application) — allow slow DB/pooler
      }
    );

    console.log("Student created successfully:", {
      id: student.id,
      name: student.user?.name,
      admissionNumber: student.admissionNumber,
      classId: student.classId,
      className: student.class ? `${student.class.name}${student.class.section ? ` • ${student.class.section}` : ""}` : "Not assigned",
    });

    return NextResponse.json(
      { message: "Student created under your school", student },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Student creation error:", error);
    
    const err = error as { code?: string; message?: string; meta?: { target?: string[] } };
    // Handle transaction timeout errors
    if (err?.code === "P1008" || err?.message?.includes("transaction") || err?.message?.includes("timeout")) {
      return NextResponse.json(
        { message: "Transaction timeout. Please try again." },
        { status: 408 }
      );
    }

    // Handle Prisma unique constraint violations
    if (err?.code === "P2002") {
      const target = err?.meta?.target;
      const field = Array.isArray(target) ? target[0] : undefined;
      const targetFields = Array.isArray(target) ? target : [];
      if (field === "email") {
        return NextResponse.json(
          { message: "Email already exists. Please use a different email or leave it blank to auto-generate." },
          { status: 400 }
        );
      }
      if (field === "admissionNumber") {
        return NextResponse.json(
          { message: "Admission number conflict. Please try again." },
          { status: 400 }
        );
      }
      if (field === "aadhaarNo") {
        return NextResponse.json(
          { message: "Aadhaar number already exists. Please check the Aadhaar number." },
          { status: 400 }
        );
      }
      if (field === "parentAadharNo") {
        return NextResponse.json(
          { message: "Parent Aadhaar conflict. Please enter a different parent Aadhaar number." },
          { status: 400 }
        );
      }
      if (
        targetFields.includes("schoolId") &&
        targetFields.includes("aadhaarNo")
      ) {
        return NextResponse.json(
          {
            message:
              "Aadhaar number already exists in this school. Please check the Aadhaar number.",
          },
          { status: 400 }
        );
      }
      if (field === "userId") {
        return NextResponse.json(
          { message: "User already exists for this student." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { message: `Duplicate entry: ${field || "unknown field"}. Please check your input.` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
