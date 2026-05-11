import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { isStudentHosteller } from "@/lib/extraFeeResidencyScope";
import { admissionWorkflowByIds, studentApplicationHasWorkflowColumn } from "@/lib/admissionsListQuery";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json(
      { message: "Only admins can view analysis" },
      { status: 403 }
    );
  }

  try {
    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const classIdParam = searchParams.get("classId");
    const classId = classIdParam && classIdParam.trim() ? classIdParam.trim() : null;

    // compute academic year start based on parameter or current date
    const now = new Date();
    let startYear = yearParam ? parseInt(yearParam, 10) : NaN;
    if (Number.isNaN(startYear)) {
      // if after April we already in next academic year, otherwise previous
      startYear = now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    }

    const yearStart = new Date(startYear, 3, 1); // Apr 1 of startYear
    const yearEnd = new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // Mar 31 of next year

    // available years: only current and optionally next after April
    const availableYears: number[] = [startYear];

    const baseStudentWhere = {
      schoolId,
      ...(classId ? { classId } : {}),
    };

    // Monthly fees collection for the selected year
    const payments = await prisma.payment.findMany({
      where: {
        status: "SUCCESS",
        student: baseStudentWhere,
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: { amount: true, createdAt: true },
    });

    const byMonth: Record<number, number> = {};
    MONTHS.forEach((_, i) => { byMonth[i] = 0; });
    payments.forEach((p) => {
      const m = new Date(p.createdAt).getMonth();
      byMonth[m] = (byMonth[m] ?? 0) + p.amount;
    });
    const monthlyFeesCollection = MONTHS.map((name, i) => ({
      month: name,
      amount: byMonth[i] ?? 0,
    }));

    // Enrollment growth - only current academic year's student count
    const enrollmentByYear: { year: number; count: number }[] = [];
    const countForYear = await prisma.student.count({
      where: baseStudentWhere,
    });
    enrollmentByYear.push({ year: startYear, count: countForYear });

    // Attendance for selected year - aggregate
    // fetch raw attendance records so we can separate students vs teachers
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        class: { schoolId, ...(classId ? { id: classId } : {}) },
        date: { gte: yearStart, lte: yearEnd },
      },
      select: { status: true, studentId: true, teacherId: true },
    });

    let studentPresent = 0;
    let studentTotal = 0;
    let teacherPresent = 0;
    let teacherTotal = 0;

    attendanceRecords.forEach((r) => {
      if (r.studentId) {
        studentTotal++;
        if (r.status === "PRESENT" || r.status === "LATE") studentPresent++;
      }
      if (r.teacherId) {
        teacherTotal++;
        if (r.status === "PRESENT" || r.status === "LATE") teacherPresent++;
      }
    });

    const studentAttendancePct =
      studentTotal > 0 ? Math.round(((studentPresent) / studentTotal) * 100) : 0;
    const teacherAttendancePct =
      teacherTotal > 0 ? Math.round(((teacherPresent) / teacherTotal) * 100) : 0;

    // Subject performance - avg (marks/totalMarks)*100 per subject
    const marks = await prisma.mark.findMany({
      where: {
        class: { schoolId, ...(classId ? { id: classId } : {}) },
        totalMarks: { gt: 0 },
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: { subject: true, marks: true, totalMarks: true },
    });
    const bySubject: Record<string, { sum: number; total: number }> = {};
    marks.forEach((m) => {
      if (!bySubject[m.subject]) bySubject[m.subject] = { sum: 0, total: 0 };
      bySubject[m.subject].sum += m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
      bySubject[m.subject].total += 1;
    });
    const subjectPerformance = Object.entries(bySubject).map(([subject, { sum, total }]) => ({
      subject,
      percentage: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    })).sort((a, b) => b.percentage - a.percentage).slice(0, 10);

    // Top performing teachers - by average student marks
    const teacherMarks = await prisma.mark.findMany({
      where: {
        class: { schoolId, ...(classId ? { id: classId } : {}) },
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: {
        teacherId: true,
        marks: true,
        totalMarks: true,
        teacher: {
          select: {
            id: true,
            name: true,
            subject: true,
            subjects: true,
          },
        },
      },
    });

    const teacherScores: Record<string, { sum: number; count: number; teacher: typeof teacherMarks[0]["teacher"] }> = {};
    teacherMarks.forEach((m) => {
      const id = m.teacherId;
      if (!teacherScores[id]) {
        teacherScores[id] = { sum: 0, count: 0, teacher: m.teacher };
      }
      if (m.totalMarks > 0) {
        teacherScores[id].sum += (m.marks / m.totalMarks) * 100;
        teacherScores[id].count += 1;
      }
    });

    // All teachers sorted best to least (first top, then descending)
    const topTeachers = Object.entries(teacherScores)
      .map(([id, { sum, count, teacher }]) => ({
        id,
        name: teacher?.name ?? "Unknown",
        subject: teacher?.subjects?.[0] ?? teacher?.subject ?? "—",
        // convert average percent (0-100) to 0-5 scale
        rating: count > 0 ? Math.round(((sum / count) / 20) * 10) / 10 : 0,
      }))
      .filter((t) => t.rating > 0)
      .sort((a, b) => b.rating - a.rating);

    // Avg teacher rating use 0-5 scale
    const avgTeacherRating = topTeachers.length > 0
      ? Math.round((topTeachers.reduce((s, t) => s + t.rating, 0) / topTeachers.length) * 10) / 10
      : 0;

    // Total fees collected for the year
    const feesCollected = payments.reduce((s, p) => s + p.amount, 0);

    // Total enrollment
    const totalEnrollment = await prisma.student.count({
      where: baseStudentWhere,
    });

    // Classes for filter dropdown
    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
      orderBy: { name: "asc" },
    });

    // Fee collection: class + section (each Class row is one section).
    // Seed from Class rows, then add any classId seen on students (covers stale FKs / partial data).
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

    const emptyAggRow = (label: string) => ({
      label,
      withFee: 0,
      sumTotalFee: 0,
      sumDiscountPercent: 0,
      sumFinalFee: 0,
      sumPaid: 0,
      sumPending: 0,
    });

    const classesForFeeTable = classId
      ? classes.filter((c) => c.id === classId)
      : classes;

    for (const c of classesForFeeTable) {
      feeAgg.set(c.id, emptyAggRow(`${c.name}${c.section ? `-${c.section}` : ""}`));
    }

    const studentsForClassDiscovery = await prisma.student.findMany({
      where: {
        schoolId,
        classId: { not: null },
        ...(classId ? { classId } : {}),
      },
      select: {
        classId: true,
        class: { select: { id: true, name: true, section: true } },
      },
    });

    const seenClassIds = new Set<string>(feeAgg.keys());
    for (const row of studentsForClassDiscovery) {
      if (!row.classId || seenClassIds.has(row.classId)) continue;
      seenClassIds.add(row.classId);
      const c = row.class;
      const label = c ? `${c.name}${c.section ? `-${c.section}` : ""}` : "Unknown class";
      feeAgg.set(row.classId, emptyAggRow(label));
    }

    const studentsWithFee = await prisma.student.findMany({
      where: {
        schoolId,
        classId: { not: null },
        ...(classId ? { classId } : {}),
      },
      select: {
        classId: true,
        fee: {
          select: {
            totalFee: true,
            discountPercent: true,
            finalFee: true,
            amountPaid: true,
            remainingFee: true,
          },
        },
      },
    });

    for (const s of studentsWithFee) {
      if (!s.classId || !s.fee) continue;
      const row = feeAgg.get(s.classId);
      if (!row) continue;
      const f = s.fee;
      row.withFee += 1;
      row.sumTotalFee += f.totalFee ?? 0;
      row.sumDiscountPercent += f.discountPercent ?? 0;
      row.sumFinalFee += f.finalFee ?? 0;
      row.sumPaid += f.amountPaid ?? 0;
      row.sumPending += f.remainingFee ?? 0;
    }

    const feeCollectionByClass = Array.from(feeAgg.entries())
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
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

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

    const feeCollectionTotals = {
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
    };

    const genderBucket = (g: string | null | undefined): "male" | "female" | "other" => {
      const x = (g ?? "").trim().toLowerCase();
      if (["male", "m", "boy", "boys"].includes(x)) return "male";
      if (["female", "f", "girl", "girls"].includes(x)) return "female";
      return "other";
    };

    type EnrollAgg = {
      className: string;
      section: string;
      male: number;
      female: number;
      total: number;
    };
    const enrollAgg = new Map<string, EnrollAgg>();
    const emptyEnroll = (name: string, section: string): EnrollAgg => ({
      className: name,
      section: section ?? "",
      male: 0,
      female: 0,
      total: 0,
    });

    for (const c of classesForFeeTable) {
      enrollAgg.set(c.id, emptyEnroll(c.name, c.section ?? ""));
    }

    const studentsForGender = await prisma.student.findMany({
      where: {
        schoolId,
        classId: { not: null },
        ...(classId ? { classId } : {}),
      },
      select: {
        classId: true,
        gender: true,
        class: { select: { id: true, name: true, section: true } },
      },
    });

    for (const s of studentsForGender) {
      if (!s.classId) continue;
      if (!enrollAgg.has(s.classId)) {
        const c = s.class;
        enrollAgg.set(
          s.classId,
          emptyEnroll(c?.name ?? "Unknown", c?.section ?? "")
        );
      }
      const row = enrollAgg.get(s.classId)!;
      row.total += 1;
      const b = genderBucket(s.gender);
      if (b === "male") row.male += 1;
      else if (b === "female") row.female += 1;
    }

    const enrollmentByClassSection = Array.from(enrollAgg.entries())
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
      });

    const enrollmentByClassSectionTotals = enrollmentByClassSection.reduce(
      (acc, r) => {
        acc.male += r.male;
        acc.female += r.female;
        acc.total += r.total;
        return acc;
      },
      { male: 0, female: 0, total: 0 }
    );

    type AdmissionComparisonAgg = {
      classLabel: string;
      existingDayScholarMale: number;
      existingDayScholarFemale: number;
      existingHostelMale: number;
      existingHostelFemale: number;
      newDayScholarMale: number;
      newDayScholarFemale: number;
      newHostelMale: number;
      newHostelFemale: number;
    };
    const emptyAdmissionComparisonAgg = (classLabel: string): AdmissionComparisonAgg => ({
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
    const admissionComparisonMap = new Map<string, AdmissionComparisonAgg>();
    const studentsForAdmissionComparison = await prisma.student.findMany({
      where: {
        schoolId,
        classId: { not: null },
        ...(classId ? { classId } : {}),
      },
      select: {
        createdAt: true,
        gender: true,
        residencyType: true,
        application: {
          select: {
            id: true,
            admissionNo: true,
            fedenaNo: true,
          },
        },
        class: { select: { name: true } },
      },
    });
    const applicationIds = studentsForAdmissionComparison
      .map((s) => s.application?.id)
      .filter((id): id is string => Boolean(id));
    const hasWorkflowColumn = await studentApplicationHasWorkflowColumn();
    const appWorkflowMap = await admissionWorkflowByIds(applicationIds, hasWorkflowColumn);

    for (const s of studentsForAdmissionComparison) {
      const classLabel = (s.class?.name ?? "Unknown class").trim() || "Unknown class";
      if (!admissionComparisonMap.has(classLabel)) {
        admissionComparisonMap.set(classLabel, emptyAdmissionComparisonAgg(classLabel));
      }
      const row = admissionComparisonMap.get(classLabel);
      if (!row) continue;

      const normalizedGender = (s.gender ?? "").trim().toLowerCase();
      const isMale = ["male", "m", "boy", "boys"].includes(normalizedGender);
      const isFemale = ["female", "f", "girl", "girls"].includes(normalizedGender);
      if (!isMale && !isFemale) continue;

      const isHostel = isStudentHosteller(s.residencyType);
      const workflowStatus = s.application?.id ? appWorkflowMap.get(s.application.id) : undefined;
      const cameFromAdmissionModule = Boolean(
        s.application &&
          (
            workflowStatus === "APPROVED" ||
            // Fallback when workflow status is unavailable/legacy:
            Boolean((s.application.admissionNo ?? "").trim()) ||
            Boolean((s.application.fedenaNo ?? "").trim())
          )
      );

      if (cameFromAdmissionModule) {
        if (isHostel) {
          if (isMale) row.newHostelMale += 1;
          else row.newHostelFemale += 1;
        } else {
          if (isMale) row.newDayScholarMale += 1;
          else row.newDayScholarFemale += 1;
        }
      } else {
        if (isHostel) {
          if (isMale) row.existingHostelMale += 1;
          else row.existingHostelFemale += 1;
        } else {
          if (isMale) row.existingDayScholarMale += 1;
          else row.existingDayScholarFemale += 1;
        }
      }
    }

    const admissionComparison = Array.from(admissionComparisonMap.values()).sort((a, b) =>
      a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true })
    );
    const admissionComparisonTotals = admissionComparison.reduce(
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

    return NextResponse.json({
      availableYears,
      classes,
      selectedYear: startYear,
      enrollmentByClassSection,
      enrollmentByClassSectionTotals,
      admissionComparison,
      admissionComparisonTotals,
      feeCollectionByClass,
      feeCollectionTotals,
      stats: {
        feesCollected,
        totalEnrollment,
        avgTeacherRating,
        avgExamScore: subjectPerformance.length > 0
          ? Math.round(
              (subjectPerformance.reduce((s, x) => s + x.percentage, 0) / subjectPerformance.length) * 10
            ) / 10
          : 0,
      },
      charts: {
        monthlyFeesCollection,
        enrollmentGrowth: enrollmentByYear,
        attendance: {
          students: studentAttendancePct,
          teachers: teacherAttendancePct,
        },
        subjectPerformance,
      },
      topTeachers,
    });
  } catch (error) {
    console.error("Analysis API error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
