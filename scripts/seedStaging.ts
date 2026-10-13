/**
 * Seeds a STAGING database with FAKE data for load/isolation testing:
 * 2 schools, an admin per school, many teachers with separate logins, classes and students with fees.
 *
 *   DATABASE_URL="<staging direct url>" npx tsx scripts/seedStaging.ts
 *
 * Safety: refuses to run unless the database host/ref is NOT the production project, and refuses when
 * the database already holds schools (unless SEED_FORCE=1). Logins are written to SEED_LOGINS_FILE
 * (default ./seed-logins.csv) and never printed.
 */
import { randomBytes, randomUUID } from "crypto";
import { writeFileSync } from "fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const PRODUCTION_REFS = ["cewthwgdzavfnonrduan"];
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL is required");
if (PRODUCTION_REFS.some((ref) => url.includes(ref))) {
  throw new Error("Refusing to seed: DATABASE_URL points at the PRODUCTION project");
}

const TEACHERS_PER_SCHOOL = [20, 10]; // 30 teachers in total
const CLASSES_PER_SCHOOL = 6;
const STUDENTS_PER_CLASS = 20;
const LOGINS_FILE = process.env.SEED_LOGINS_FILE ?? "seed-logins.csv";

const prisma = new PrismaClient({ datasourceUrl: url });

async function main() {
  const existing = await prisma.school.count();
  if (existing > 0 && process.env.SEED_FORCE !== "1") {
    throw new Error(`Database already has ${existing} school(s); set SEED_FORCE=1 to seed anyway`);
  }

  const password = randomBytes(9).toString("base64url");
  const hash = await bcrypt.hash(password, 8);
  const rows: string[] = ["role,email,password,school"];
  const grades = ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6"];

  for (let s = 0; s < TEACHERS_PER_SCHOOL.length; s++) {
    const label = s === 0 ? "A" : "B";
    const school = await prisma.school.create({
      data: { name: `Staging School ${label}`, address: `${label} Test Road`, location: `Test City ${label}` },
    });

    const admin = await prisma.user.create({
      data: {
        name: `Admin ${label}`,
        email: `admin.${label.toLowerCase()}@staging.test`,
        password: hash,
        role: "SCHOOLADMIN",
        schoolId: school.id,
      },
    });
    rows.push(`SCHOOLADMIN,${admin.email},${password},${school.name}`);

    const teacherIds: string[] = [];
    const teacherData = [];
    for (let t = 1; t <= TEACHERS_PER_SCHOOL[s]; t++) {
      const id = randomUUID();
      teacherIds.push(id);
      const email = `teacher${t}.${label.toLowerCase()}@staging.test`;
      teacherData.push({ id, name: `Teacher ${t} ${label}`, email, password: hash, role: "TEACHER" as const, schoolId: school.id });
      rows.push(`TEACHER,${email},${password},${school.name}`);
    }
    await prisma.user.createMany({ data: teacherData });

    let admissionCounter = 1;
    for (let c = 0; c < CLASSES_PER_SCHOOL; c++) {
      const cls = await prisma.class.create({
        data: {
          name: `${grades[c].replace("GRADE_", "Grade ")}`,
          schoolId: school.id,
          teacherId: teacherIds[c % teacherIds.length],
        },
      });

      const users = [];
      const students = [];
      const fees = [];
      for (let k = 0; k < STUDENTS_PER_CLASS; k++) {
        const n = admissionCounter++;
        const userId = randomUUID();
        const studentId = randomUUID();
        users.push({
          id: userId,
          name: `Student ${label}${n}`,
          email: `student${n}.${label.toLowerCase()}@staging.test`,
          password: hash,
          role: "STUDENT" as const,
          schoolId: school.id,
        });
        students.push({
          id: studentId,
          userId,
          schoolId: school.id,
          classId: cls.id,
          admissionNumber: `${label}-${String(n).padStart(4, "0")}`,
          fatherName: `Parent ${label}${n}`,
          aadhaarNo: `${s + 1}${String(n).padStart(3, "0")}${String(c).padStart(2, "0")}${String(k).padStart(2, "0")}00000`.slice(0, 12).padEnd(12, "0"),
          phoneNo: `90000${String(s)}${String(n).padStart(4, "0")}`,
          dob: new Date(2014, 0, 1 + (n % 300)),
        });
        const total = 30000 + (n % 5) * 2000;
        fees.push({ studentId, totalFee: total, finalFee: total, remainingFee: total });
      }
      await prisma.user.createMany({ data: users });
      await prisma.student.createMany({ data: students });
      await prisma.studentFee.createMany({ data: fees });
    }
  }

  writeFileSync(LOGINS_FILE, rows.join("\n") + "\n", { mode: 0o600 });
  console.log(`Seeded ${TEACHERS_PER_SCHOOL.length} schools. Logins written to ${LOGINS_FILE} (not printed).`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
