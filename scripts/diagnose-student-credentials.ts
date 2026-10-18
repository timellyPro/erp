/**
 * Read-only: why can't the credentials page show a password for some students?
 * Counts active students per school by reason (see StudentPasswordState in
 * lib/students/studentDefaultPassword.ts). Prints counts only, no names, ids or passwords, so the
 * output is safe to paste into a bug report. Pass --details to also list admission numbers locally.
 *
 *   npx tsx scripts/diagnose-student-credentials.ts [--school-id=<id>] [--details]
 */
import prisma from "../lib/db";
import { resolveStudentPasswordState } from "@/lib/students/studentDefaultPassword";

async function main() {
  const schoolArg = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  const details = process.argv.includes("--details");
  const schools = await prisma.school.findMany({
    where: schoolArg ? { id: schoolArg } : {},
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let n = 0;
  for (const school of schools) {
    n += 1;
    const students = await prisma.student.findMany({
      where: { schoolId: school.id, status: "Active" },
      select: { admissionNumber: true, dob: true, user: { select: { password: true } } },
    });
    const counts = { DEFAULT: 0, CUSTOM: 0, NO_LOGIN: 0, NO_DOB: 0 };
    const listed: string[] = [];
    for (const s of students) {
      const r = await resolveStudentPasswordState(s.dob, s.user?.password);
      counts[r.state] += 1;
      if (details && r.state !== "DEFAULT") listed.push(`${s.admissionNumber}\t${r.state}`);
    }
    console.log(
      `school #${n}: ${students.length} active | shown ${counts.DEFAULT} | password changed ${counts.CUSTOM} | no login ${counts.NO_LOGIN} | no DOB ${counts.NO_DOB}`
    );
    if (details) for (const line of listed) console.log(`  ${line}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
