import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { isStudentHosteller } from "@/lib/extraFeeResidencyScope";
import { admissionWorkflowByIds, studentApplicationHasWorkflowColumn } from "@/lib/admissionsListQuery";
import { activeStudentWhere } from "@/lib/studentStatus";
import type {
  SchoolAnalysisAdmissionRow,
  SchoolAnalysisAdmissionTotals,
  SchoolAnalysisClass,
  SchoolAnalysisEnrollmentRow,
  SchoolAnalysisFeeCollectionRow,
  SchoolAnalysisPayload,
  SchoolAnalysisTablesPayload,
} from "@/lib/schoolAnalysisTypes";

export { defaultAnalysisStartYear, resolveAnalysisStartYear } from "@/lib/schoolAnalysisYear";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export type SchoolAnalysisTableSection = "gender-enrollment" | "admission-comparison" | "fee-collection";

function yearBounds(startYear: number) {
  return {
    yearStart: new Date(startYear, 3, 1),
    yearEnd: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
}

function genderBucket(g: string | null | undefined): "male" | "female" | "other" {
  const x = (g ?? "").trim().toLowerCase();
  if (["male", "m", "boy", "boys"].includes(x)) return "male";
  if (["female", "f", "girl", "girls"].includes(x)) return "female";
  return "other";
}

/** Stats, charts, teachers — fast shell for overview. */
export async function buildSchoolAnalysisFast(
  schoolId: string,
  startYear: number,
  classId: string | null
): Promise<SchoolAnalysisPayload> {
  const { yearStart, yearEnd } = yearBounds(startYear);
  const baseStudentWhere = {
    schoolId,
    ...activeStudentWhere,
    ...(classId ? { classId } : {}),
  };

  const [payments, totalEnrollment, attendanceRows, marks, classes] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: "SUCCESS",
        student: baseStudentWhere,
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: { amount: true, createdAt: true },
    }),
    prisma.student.count({ where: baseStudentWhere }),
    prisma.$queryRaw<
      Array<{ student_total: bigint; student_present: bigint; teacher_total: bigint; teacher_present: bigint }>
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE a."studentId" IS NOT NULL)::bigint AS student_total,
        COUNT(*) FILTER (
          WHERE a."studentId" IS NOT NULL AND a.status IN ('PRESENT', 'LATE')
        )::bigint AS student_present,
        COUNT(*) FILTER (WHERE a."teacherId" IS NOT NULL)::bigint AS teacher_total,
        COUNT(*) FILTER (
          WHERE a."teacherId" IS NOT NULL AND a.status IN ('PRESENT', 'LATE')
        )::bigint AS teacher_present
      FROM "Attendance" a
      INNER JOIN "Class" c ON c.id = a."classId"
      WHERE c."schoolId" = ${schoolId}
        ${classId ? Prisma.sql`AND c.id = ${classId}` : Prisma.empty}
        AND a.date >= ${yearStart}
        AND a.date <= ${yearEnd}
    `),
    prisma.mark.findMany({
      where: {
        class: { schoolId, ...(classId ? { id: classId } : {}) },
        totalMarks: { gt: 0 },
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: {
        subject: true,
        marks: true,
        totalMarks: true,
        teacherId: true,
        teacher: {
          select: {
            id: true,
            name: true,
            subject: true,
            subjects: true,
          },
        },
      },
    }),
    prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byMonth: Record<number, number> = {};
  MONTHS.forEach((_, i) => {
    byMonth[i] = 0;
  });
  let feesCollected = 0;
  payments.forEach((p) => {
    feesCollected += p.amount;
    const m = new Date(p.createdAt).getMonth();
    byMonth[m] = (byMonth[m] ?? 0) + p.amount;
  });

  const monthlyFeesCollection = MONTHS.map((name, i) => ({
    month: name,
    amount: byMonth[i] ?? 0,
  }));

  const att = attendanceRows[0];
  const studentTotal = Number(att?.student_total ?? 0);
  const studentPresent = Number(att?.student_present ?? 0);
  const teacherTotal = Number(att?.teacher_total ?? 0);
  const teacherPresent = Number(att?.teacher_present ?? 0);

  const bySubject: Record<string, { sum: number; total: number }> = {};
  const teacherScores: Record<
    string,
    { sum: number; count: number; teacher: (typeof marks)[0]["teacher"] }
  > = {};

  marks.forEach((m) => {
    if (!bySubject[m.subject]) bySubject[m.subject] = { sum: 0, total: 0 };
    bySubject[m.subject].sum += m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
    bySubject[m.subject].total += 1;

    const id = m.teacherId;
    if (!teacherScores[id]) {
      teacherScores[id] = { sum: 0, count: 0, teacher: m.teacher };
    }
    if (m.totalMarks > 0) {
      teacherScores[id].sum += (m.marks / m.totalMarks) * 100;
      teacherScores[id].count += 1;
    }
  });

  const subjectPerformance = Object.entries(bySubject)
    .map(([subject, { sum, total }]) => ({
      subject,
      percentage: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);

  const topTeachers = Object.entries(teacherScores)
    .map(([id, { sum, count, teacher }]) => ({
      id,
      name: teacher?.name ?? "Unknown",
      subject: teacher?.subjects?.[0] ?? teacher?.subject ?? "—",
      rating: count > 0 ? Math.round((sum / count / 20) * 10) / 10 : 0,
    }))
    .filter((t) => t.rating > 0)
    .sort((a, b) => b.rating - a.rating);

  const avgTeacherRating =
    topTeachers.length > 0
      ? Math.round((topTeachers.reduce((s, t) => s + t.rating, 0) / topTeachers.length) * 10) / 10
      : 0;

  return {
    availableYears: [startYear],
    classes,
    selectedYear: startYear,
    stats: {
      feesCollected,
      totalEnrollment,
      avgTeacherRating,
      avgExamScore:
        subjectPerformance.length > 0
          ? Math.round(
              (subjectPerformance.reduce((s, x) => s + x.percentage, 0) / subjectPerformance.length) * 10
            ) / 10
          : 0,
    },
    charts: {
      monthlyFeesCollection,
      enrollmentGrowth: [{ year: startYear, count: totalEnrollment }],
      attendance: {
        students: studentTotal > 0 ? Math.round((studentPresent / studentTotal) * 100) : 0,
        teachers: teacherTotal > 0 ? Math.round((teacherPresent / teacherTotal) * 100) : 0,
      },
      subjectPerformance,
    },
    topTeachers,
  };
}

/** Fee / enrollment / admission tables — one student scan. */
export async function buildSchoolAnalysisTables(
  schoolId: string,
  startYear: number,
  classId: string | null,
  existingClasses?: SchoolAnalysisClass[],
  tableSection?: SchoolAnalysisTableSection | null
): Promise<SchoolAnalysisTablesPayload> {
  void startYear;
  const includeEnrollment = !tableSection || tableSection === "gender-enrollment";
  const includeAdmission = !tableSection || tableSection === "admission-comparison";
  const includeFees = !tableSection || tableSection === "fee-collection";
  const classes =
    existingClasses ??
    (await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
      orderBy: { name: "asc" },
    }));

  const classesForFeeTable = classId ? classes.filter((c) => c.id === classId) : classes;

  const emptyAggRow = (label: string) => ({
    label,
    withFee: 0,
    sumTotalFee: 0,
    sumDiscountPercent: 0,
    sumFinalFee: 0,
    sumPaid: 0,
    sumPending: 0,
  });

  const feeAgg = new Map<
    string,
    {
      label: string;
      withFee: number;
      sumTotalFee: number;
      sumDiscountPercent: number;
      sumFinalFee: number;
      sumPaid: number;
      sumPending: number;
    }
  >();

  for (const c of classesForFeeTable) {
    feeAgg.set(c.id, emptyAggRow(`${c.name}${c.section ? `-${c.section}` : ""}`));
  }

  const emptyEnroll = (name: string, section: string) => ({
    className: name,
    section: section ?? "",
    male: 0,
    female: 0,
    total: 0,
  });
  const enrollAgg = new Map<
    string,
    { className: string; section: string; male: number; female: number; total: number }
  >();
  for (const c of classesForFeeTable) {
    enrollAgg.set(c.id, emptyEnroll(c.name, c.section ?? ""));
  }

  const emptyAdmissionComparisonAgg = (classLabel: string): SchoolAnalysisAdmissionRow => ({
    classLabel,
    existingDayScholarMale: 0,
    existingDayScholarFemale: 0,
    existingHostelMale: 0,
    existingHostelFemale: 0,
    newDayScholarMale: 0,
    newDayScholarFemale: 0,
    newHostelMale: 0,
    newHostelFemale: 0,
  });
  const admissionComparisonMap = new Map<string, SchoolAnalysisAdmissionRow>();

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      ...activeStudentWhere,
      classId: { not: null },
      ...(classId ? { classId } : {}),
    },
    select: {
      classId: true,
      gender: true,
      residencyType: true,
      class: { select: { id: true, name: true, section: true } },
      ...(includeAdmission
        ? {
            application: {
              select: {
                id: true,
                admissionNo: true,
                fedenaNo: true,
              },
            },
          }
        : {}),
      ...(includeFees
        ? {
            fee: {
              select: {
                totalFee: true,
                discountPercent: true,
                finalFee: true,
                amountPaid: true,
                remainingFee: true,
              },
            },
          }
        : {}),
    },
  });

  const applicationIds = includeAdmission
    ? students
        .map((s) => s.application?.id)
        .filter((id): id is string => Boolean(id))
    : [];
  const appWorkflowMap = includeAdmission
    ? await admissionWorkflowByIds(applicationIds, await studentApplicationHasWorkflowColumn())
    : new Map<string, string>();

  const seenClassIds = new Set<string>(feeAgg.keys());

  for (const s of students) {
    if (!s.classId) continue;

    if (!seenClassIds.has(s.classId)) {
      seenClassIds.add(s.classId);
      const c = s.class;
      const label = c ? `${c.name}${c.section ? `-${c.section}` : ""}` : "Unknown class";
      feeAgg.set(s.classId, emptyAggRow(label));
    }

    if (!enrollAgg.has(s.classId)) {
      const c = s.class;
      enrollAgg.set(s.classId, emptyEnroll(c?.name ?? "Unknown", c?.section ?? ""));
    }

    const feeRow = includeFees ? feeAgg.get(s.classId) : undefined;
    if (feeRow && s.fee) {
      const f = s.fee;
      feeRow.withFee += 1;
      feeRow.sumTotalFee += f.totalFee ?? 0;
      feeRow.sumDiscountPercent += f.discountPercent ?? 0;
      feeRow.sumFinalFee += f.finalFee ?? 0;
      feeRow.sumPaid += f.amountPaid ?? 0;
      feeRow.sumPending += f.remainingFee ?? 0;
    }

    if (includeEnrollment) {
      const enrollRow = enrollAgg.get(s.classId)!;
      enrollRow.total += 1;
      const bucket = genderBucket(s.gender);
      if (bucket === "male") enrollRow.male += 1;
      else if (bucket === "female") enrollRow.female += 1;
    }

    if (includeAdmission) {
      const classLabel = (s.class?.name ?? "Unknown class").trim() || "Unknown class";
      if (!admissionComparisonMap.has(classLabel)) {
        admissionComparisonMap.set(classLabel, emptyAdmissionComparisonAgg(classLabel));
      }
      const admissionRow = admissionComparisonMap.get(classLabel);
      if (admissionRow) {
      const normalizedGender = (s.gender ?? "").trim().toLowerCase();
      const isMale = ["male", "m", "boy", "boys"].includes(normalizedGender);
      const isFemale = ["female", "f", "girl", "girls"].includes(normalizedGender);
      if (isMale || isFemale) {
        const isHostel = isStudentHosteller(s.residencyType);
        const workflowStatus = s.application?.id ? appWorkflowMap.get(s.application.id) : undefined;
        const cameFromAdmissionModule = Boolean(
          s.application &&
            (workflowStatus === "APPROVED" ||
              Boolean((s.application.admissionNo ?? "").trim()) ||
              Boolean((s.application.fedenaNo ?? "").trim()))
        );

        if (cameFromAdmissionModule) {
          if (isHostel) {
            if (isMale) admissionRow.newHostelMale += 1;
            else admissionRow.newHostelFemale += 1;
          } else {
            if (isMale) admissionRow.newDayScholarMale += 1;
            else admissionRow.newDayScholarFemale += 1;
          }
        } else {
          if (isHostel) {
            if (isMale) admissionRow.existingHostelMale += 1;
            else admissionRow.existingHostelFemale += 1;
          } else {
            if (isMale) admissionRow.existingDayScholarMale += 1;
            else admissionRow.existingDayScholarFemale += 1;
          }
        }
      }
      }
    }
  }

  const feeCollectionByClass: SchoolAnalysisFeeCollectionRow[] | undefined = includeFees ? Array.from(feeAgg.entries())
    .map(([id, r]) => {
      const totalFees = Math.round(r.sumTotalFee * 100) / 100;
      const finalFees = Math.round(r.sumFinalFee * 100) / 100;
      const paidFee = Math.round(r.sumPaid * 100) / 100;
      const pendingFee = Math.round(r.sumPending * 100) / 100;
      const avgDiscountPercent =
        r.withFee > 0 ? Math.round((r.sumDiscountPercent / r.withFee) * 10) / 10 : 0;
      const collectionPercent =
        finalFees > 0.01 ? Math.min(100, Math.round((paidFee / finalFees) * 1000) / 10) : 0;
      const duePercent =
        finalFees > 0.01 ? Math.min(100, Math.round((pendingFee / finalFees) * 1000) / 10) : 0;

      return {
        classId: id,
        label: r.label,
        totalFees,
        avgDiscountPercent,
        finalFees,
        paidFee,
        pendingFee,
        collectionPercent,
        duePercent,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) : undefined;

  let sumTotalFeesAll = 0;
  let sumFinalFeesAll = 0;
  let sumPaidAll = 0;
  let sumPendingAll = 0;
  let studentsWithFeeAll = 0;
  let sumDiscountPercentAll = 0;
  for (const [, r] of feeAgg) {
    sumTotalFeesAll += r.sumTotalFee;
    sumFinalFeesAll += r.sumFinalFee;
    sumPaidAll += r.sumPaid;
    sumPendingAll += r.sumPending;
    studentsWithFeeAll += r.withFee;
    sumDiscountPercentAll += r.sumDiscountPercent;
  }

  const feeCollectionTotals: Omit<SchoolAnalysisFeeCollectionRow, "classId"> | undefined = includeFees ? {
    label: classId ? "Selected class total" : "School total",
    totalFees: Math.round(sumTotalFeesAll * 100) / 100,
    avgDiscountPercent:
      studentsWithFeeAll > 0
        ? Math.round((sumDiscountPercentAll / studentsWithFeeAll) * 10) / 10
        : 0,
    finalFees: Math.round(sumFinalFeesAll * 100) / 100,
    paidFee: Math.round(sumPaidAll * 100) / 100,
    pendingFee: Math.round(sumPendingAll * 100) / 100,
    collectionPercent:
      sumFinalFeesAll > 0.01
        ? Math.min(100, Math.round((sumPaidAll / sumFinalFeesAll) * 1000) / 10)
        : 0,
    duePercent:
      sumFinalFeesAll > 0.01
        ? Math.min(100, Math.round((sumPendingAll / sumFinalFeesAll) * 1000) / 10)
        : 0,
  } : undefined;

  const enrollmentByClassSection: SchoolAnalysisEnrollmentRow[] | undefined = includeEnrollment ? Array.from(enrollAgg.entries())
    .map(([id, r]) => ({
      classId: id,
      className: r.className,
      section: r.section || null,
      male: r.male,
      female: r.female,
      total: r.total,
    }))
    .sort((a, b) => {
      const cn = a.className.localeCompare(b.className, undefined, { numeric: true });
      if (cn !== 0) return cn;
      return (a.section || "").localeCompare(b.section || "", undefined, { numeric: true });
    }) : undefined;

  const enrollmentByClassSectionTotals = enrollmentByClassSection?.reduce(
    (acc, r) => {
      acc.male += r.male;
      acc.female += r.female;
      acc.total += r.total;
      return acc;
    },
    { male: 0, female: 0, total: 0 }
  );

  const admissionComparison = includeAdmission
    ? Array.from(admissionComparisonMap.values()).sort((a, b) =>
        a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true })
      )
    : undefined;

  const admissionComparisonTotals = admissionComparison?.reduce<SchoolAnalysisAdmissionTotals>(
    (acc, row) => {
      acc.existingDayScholarMale += row.existingDayScholarMale;
      acc.existingDayScholarFemale += row.existingDayScholarFemale;
      acc.existingHostelMale += row.existingHostelMale;
      acc.existingHostelFemale += row.existingHostelFemale;
      acc.newDayScholarMale += row.newDayScholarMale;
      acc.newDayScholarFemale += row.newDayScholarFemale;
      acc.newHostelMale += row.newHostelMale;
      acc.newHostelFemale += row.newHostelFemale;
      return acc;
    },
    {
      existingDayScholarMale: 0,
      existingDayScholarFemale: 0,
      existingHostelMale: 0,
      existingHostelFemale: 0,
      newDayScholarMale: 0,
      newDayScholarFemale: 0,
      newHostelMale: 0,
      newHostelFemale: 0,
    }
  );

  return {
    classes,
    enrollmentByClassSection,
    enrollmentByClassSectionTotals,
    admissionComparison,
    admissionComparisonTotals,
    feeCollectionByClass,
    feeCollectionTotals,
  };
}

export async function buildSchoolAnalysisFull(
  schoolId: string,
  startYear: number,
  classId: string | null
): Promise<SchoolAnalysisPayload> {
  const shell = await buildSchoolAnalysisFast(schoolId, startYear, classId);
  const tables = await buildSchoolAnalysisTables(schoolId, startYear, classId, shell.classes);
  return { ...shell, ...tables };
}
