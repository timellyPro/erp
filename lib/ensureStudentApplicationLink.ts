import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "studentApplication">;

type StudentForApplicationLink = {
  id: string;
  schoolId: string;
  aadhaarNo: string;
  admissionNumber: string;
  fatherName: string;
  motherName: string | null;
  phoneNo: string;
  dob: Date;
  gender: string | null;
  classId: string | null;
  address: string | null;
  user: { name: string | null } | null;
  class?: { name: string } | null;
};

function inferGradeFromClassName(className?: string | null): Prisma.StudentApplicationCreateInput["gradeSought"] {
  const match = String(className ?? "").match(/\b(\d{1,2})\b/);
  const n = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 11) return "GRADE_1";
  const grades = [
    "GRADE_1",
    "GRADE_2",
    "GRADE_3",
    "GRADE_4",
    "GRADE_5",
    "GRADE_6",
    "GRADE_7",
    "GRADE_8",
    "GRADE_9",
    "GRADE_10",
    "GRADE_11",
  ] as const;
  return grades[n - 1] ?? "GRADE_1";
}

function defaultParentAadhar(student: StudentForApplicationLink) {
  const digits = student.aadhaarNo.replace(/\D/g, "");
  const base = digits.length >= 8 ? digits.slice(0, 8) : digits.padEnd(8, "0");
  return `${base}${student.id.slice(-4)}`;
}

/** Ensure bulk-uploaded / legacy students have a linked admission row for parent contact fields. */
export async function ensureStudentApplicationLink(
  db: Db,
  student: StudentForApplicationLink
): Promise<string | null> {
  const linked = await db.studentApplication.findFirst({
    where: { studentId: student.id, schoolId: student.schoolId },
    select: { id: true },
  });
  if (linked) return linked.id;

  const byAadhar = await db.studentApplication.findUnique({
    where: { schoolId_aadharNo: { schoolId: student.schoolId, aadharNo: student.aadhaarNo } },
    select: { id: true, studentId: true },
  });
  if (byAadhar) {
    if (!byAadhar.studentId) {
      await db.studentApplication.update({
        where: { id: byAadhar.id },
        data: { studentId: student.id },
      });
    }
    return byAadhar.id;
  }

  const fullName = (student.user?.name ?? "Student").trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "Student";
  const lastName = nameParts.slice(1).join(" ") || firstName;
  const gender =
    String(student.gender ?? "").trim().toLowerCase().startsWith("f") ? "FEMALE" : "MALE";
  const phone = student.phoneNo.trim() || "-";

  const created = await db.studentApplication.create({
    data: {
      schoolId: student.schoolId,
      classId: student.classId,
      studentId: student.id,
      applicationNo: student.admissionNumber,
      gradeSought: inferGradeFromClassName(student.class?.name),
      boardingType: "SEMI_RESIDENTIAL",
      workflowStatus: "APPROVED",
      firstName,
      lastName,
      gender,
      dateOfBirth: student.dob,
      aadharNo: student.aadhaarNo,
      firstLanguage: "English",
      nationality: "Indian",
      languagesAtHome: "English",
      houseNo: student.address?.trim() || "-",
      street: "-",
      city: "-",
      state: "-",
      pinCode: "-",
      parentName: student.fatherName.trim() || "-",
      motherName: student.motherName,
      parentOccupation: "-",
      officeAddress: "-",
      parentPhone: phone,
      parentEmail: "-",
      parentAadharNo: defaultParentAadhar(student),
      parentWhatsapp: phone,
      bankAccountNo: "-",
      previousSchoolName: "-",
      previousSchoolAddress: "-",
      emergencyFatherNo: phone,
      emergencyMotherNo: "-",
      emergencyGuardianNo: phone,
    },
    select: { id: true },
  });

  return created.id;
}
