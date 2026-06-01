import prisma from "@/lib/db";
import {
  buildFeeHeadAmountsByPaymentId,
  dominantFeeHead,
  feeHeadLinesFromMap,
} from "@/lib/paymentFeeHeadLines";

export type StudentDetailsTabPayload = {
  student: {
    id: string;
    name: string;
    schoolName: string;
    admissionNumber: string;
    email: string;
    photoUrl: string | null;
    rollNo: string;
    penNumber: string;
    apaarId: string;
    dob: string;
    age: number | null;
    address: string;
    phone: string;
    fatherName: string;
    motherName: string;
    gender: string;
    fatherOccupation: string;
    motherOccupation: string;
    fatherPhone: string;
    motherPhone: string;
    previousSchool: string;
    aadhaarNo: string;
    officeAddress: string;
    parentAadharNo: string;
    parentWhatsapp: string;
    bankAccountNo: string;
    houseNo: string;
    street: string;
    city: string;
    town: string;
    state: string;
    pinCode: string;
    nationality: string;
    languagesAtHome: string;
    caste: string;
    religion: string;
    emergencyFatherNo: string;
    emergencyMotherNo: string;
    emergencyGuardianNo: string;
    parentEmail: string;
    residencyType: string;
    applicationFee: number | null;
    admissionFee: number | null;
    createdAt: string;
    status: string;
    class: {
      id: string;
      name: string;
      section: string | null;
      displayName: string;
    } | null;
  };
  fee: {
    baseTotalFee: number;
    discountPercent: number;
    discountFixedAmount: number | null;
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
    tuitionPaid?: number;
    moneyForStudent: number | null;
    discountFeeHeadKey: string | null;
    discountFeeHeadLabel: string | null;
    discountRemarks: string | null;
  } | null;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    transactionId: string | null;
    feeTypeName?: string;
    feeTypeAmount?: number;
    feeAllocations?: Array<{ name: string; amount: number }>;
  }>;
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{
    id: string;
    title: string;
    issuedDate: string;
    issuedBy: string | null;
    certificateUrl: string | null;
  }>;
};

async function loadPaymentsWithFeeTypes(studentId: string) {
  const payments = await prisma.payment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length === 0) {
    return { payments: [], tuitionPaidFromAllocations: 0 };
  }

  const [paymentAllocations, refundAllocations] = await Promise.all([
    prisma.paymentFeeAllocation.findMany({
      where: { paymentId: { in: paymentIds }, allocationType: "PAYMENT" },
      select: {
        paymentId: true,
        headType: true,
        componentIndex: true,
        componentName: true,
        extraFeeId: true,
        allocatedAmount: true,
      },
    }),
    prisma.paymentFeeAllocation.findMany({
      where: { paymentId: { in: paymentIds }, allocationType: "REFUND" },
      select: {
        paymentId: true,
        headType: true,
        componentIndex: true,
        allocatedAmount: true,
      },
    }),
  ]);

  const extraFeeIds = Array.from(
    new Set(
      paymentAllocations
        .filter((a) => a.headType === "EXTRA_FEE" && !!a.extraFeeId)
        .map((a) => a.extraFeeId as string)
    )
  );

  const extraFees =
    extraFeeIds.length > 0
      ? await prisma.extraFee.findMany({
          where: { id: { in: extraFeeIds } },
          select: { id: true, name: true },
        })
      : [];

  const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));
  const feeHeadAmountsByPaymentId = buildFeeHeadAmountsByPaymentId(
    paymentAllocations,
    extraFeeNameById
  );

  const tuitionPaidFromAllocations =
    paymentAllocations
      .filter((a) => a.headType === "BASE_COMPONENT" && a.componentIndex === -1)
      .reduce((s, a) => s + a.allocatedAmount, 0) -
    refundAllocations
      .filter((a) => a.headType === "BASE_COMPONENT" && a.componentIndex === -1)
      .reduce((s, a) => s + a.allocatedAmount, 0);

  return {
    payments: payments.map((p) => {
      const headMap = feeHeadAmountsByPaymentId.get(p.id);
      const feeAllocations = feeHeadLinesFromMap(headMap);
      const dominant = dominantFeeHead(headMap);
      return {
        id: p.id,
        amount: p.amount,
        status: p.status,
        method: p.gateway ?? "—",
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
        transactionId: p.transactionId ?? null,
        feeTypeName: dominant?.name,
        feeTypeAmount: dominant?.amount,
        feeAllocations: feeAllocations.length > 0 ? feeAllocations : undefined,
      };
    }),
    tuitionPaidFromAllocations,
  };
}

/** Tab payload for student profile (payments, attendance, marks, certificates). */
export async function buildStudentDetailsTabPayload(
  studentId: string,
  schoolId: string | null
): Promise<StudentDetailsTabPayload | null> {
  const whereClause = schoolId ? { id: studentId, schoolId } : { id: studentId };
  const student = await prisma.student.findFirst({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, email: true, photoUrl: true } },
      class: { select: { id: true, name: true, section: true } },
      school: { select: { name: true } },
      fee: {
        select: {
          totalFee: true,
          finalFee: true,
          discountPercent: true,
          amountPaid: true,
          remainingFee: true,
          discountFeeHeadKey: true,
          discountFeeHeadLabel: true,
          discountRemarks: true,
        },
      },
      application: {
        select: {
          parentEmail: true,
          officeAddress: true,
          parentAadharNo: true,
          parentWhatsapp: true,
          bankAccountNo: true,
          houseNo: true,
          street: true,
          city: true,
          town: true,
          state: true,
          pinCode: true,
          nationality: true,
          languagesAtHome: true,
          caste: true,
          religion: true,
          emergencyFatherNo: true,
          emergencyMotherNo: true,
          emergencyGuardianNo: true,
        },
      },
    },
  });

  if (!student) return null;

  const fallbackApplication =
    student.application ??
    (await prisma.studentApplication.findFirst({
      where: { schoolId: student.schoolId, aadharNo: student.aadhaarNo },
      select: { emergencyMotherNo: true },
      orderBy: { updatedAt: "desc" },
    }));

  const motherPhoneRaw = String(fallbackApplication?.emergencyMotherNo ?? "").trim();
  const motherPhoneResolved =
    !motherPhoneRaw || motherPhoneRaw === "-" || motherPhoneRaw === "—" ? "" : motherPhoneRaw;

  const [paymentsBundle, attendances, marks, certificates] = await Promise.all([
    loadPaymentsWithFeeTypes(studentId),
    prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      take: 90,
    }),
    prisma.mark.findMany({
      where: { studentId },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.certificate.findMany({
      where: { studentId },
      include: {
        template: { select: { name: true } },
        issuedBy: { select: { name: true } },
      },
      orderBy: { issuedDate: "desc" },
    }),
  ]);

  const dob = student.dob ? new Date(student.dob) : null;
  const age = dob
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const attendanceByMonth = attendances.reduce(
    (acc, a) => {
      const key = a.date.toISOString().slice(0, 7);
      if (!acc[key]) acc[key] = { present: 0, total: 0 };
      acc[key].total += 1;
      if (a.status === "PRESENT" || a.status === "LATE") acc[key].present += 1;
      return acc;
    },
    {} as Record<string, { present: number; total: number }>
  );

  const attendanceTrends = Object.entries(attendanceByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, v]) => ({
      month,
      present: v.present,
      total: v.total,
      pct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
    }));

  const marksBySubject = marks.reduce(
    (acc, m) => {
      const key = m.subject;
      if (!acc[key]) acc[key] = { marks: 0, total: 0, count: 0 };
      acc[key].marks += m.marks;
      acc[key].total += m.totalMarks;
      acc[key].count += 1;
      return acc;
    },
    {} as Record<string, { marks: number; total: number; count: number }>
  );

  const academicPerformance = Object.entries(marksBySubject).map(([subject, v]) => ({
    subject,
    score: v.total > 0 ? Math.round((v.marks / v.total) * 100) : 0,
  }));

  const { tuitionPaidFromAllocations } = paymentsBundle;

  return {
    student: {
      id: student.id,
      name: student.user?.name ?? "",
      schoolName: student.school?.name ?? "",
      admissionNumber: student.admissionNumber,
      email: student.user?.email ?? "",
      photoUrl: student.user?.photoUrl ?? null,
      rollNo: student.rollNo ?? "",
      penNumber: (student as { penNumber?: string | null }).penNumber ?? "",
      apaarId: (student as { apaarId?: string | null }).apaarId ?? "",
      dob: student.dob?.toISOString().slice(0, 10) ?? "",
      age,
      address: student.address ?? "",
      phone: student.phoneNo ?? "",
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      gender: student.gender ?? "",
      fatherOccupation: student.occupation ?? "",
      motherOccupation: student.occupation ?? "",
      fatherPhone: student.phoneNo ?? "",
      motherPhone: motherPhoneResolved,
      previousSchool: student.previousSchool ?? "",
      aadhaarNo: student.aadhaarNo ?? "",
      officeAddress: student.application?.officeAddress ?? "",
      parentAadharNo: student.application?.parentAadharNo ?? "",
      parentWhatsapp: student.application?.parentWhatsapp ?? "",
      bankAccountNo: student.application?.bankAccountNo ?? "",
      houseNo: student.application?.houseNo ?? "",
      street: student.application?.street ?? "",
      city: student.application?.city ?? "",
      town: student.application?.town ?? "",
      state: student.application?.state ?? "",
      pinCode: student.application?.pinCode ?? "",
      nationality: student.application?.nationality ?? "Indian",
      languagesAtHome: student.application?.languagesAtHome ?? "",
      caste: student.application?.caste ?? "",
      religion: student.application?.religion ?? "",
      emergencyFatherNo: student.application?.emergencyFatherNo ?? "",
      emergencyMotherNo: student.application?.emergencyMotherNo ?? "",
      emergencyGuardianNo: student.application?.emergencyGuardianNo ?? "",
      parentEmail: student.application?.parentEmail ?? "",
      residencyType: student.residencyType ?? "Day Scholar",
      applicationFee: student.applicationFee ?? null,
      admissionFee: student.admissionFee ?? null,
      createdAt: student.createdAt?.toISOString() ?? "",
      status: student.status ?? "Active",
      class: student.class
        ? {
            id: student.class.id,
            name: student.class.name,
            section: student.class.section,
            displayName: `${student.class.name}${student.class.section ? `-${student.class.section}` : ""}`,
          }
        : null,
    },
    fee: student.fee
      ? {
          baseTotalFee: student.fee.totalFee,
          discountPercent: student.fee.discountPercent,
          discountFixedAmount: Math.max(0, student.fee.totalFee - student.fee.finalFee),
          totalFee: student.fee.finalFee,
          amountPaid: student.fee.amountPaid,
          remainingFee: student.fee.remainingFee,
          tuitionPaid:
            tuitionPaidFromAllocations > 0.00001
              ? tuitionPaidFromAllocations
              : student.fee.amountPaid,
          moneyForStudent: (student.fee as { moneyForStudent?: number }).moneyForStudent ?? null,
          discountFeeHeadKey:
            (student.fee as { discountFeeHeadKey?: string | null }).discountFeeHeadKey ?? null,
          discountFeeHeadLabel:
            (student.fee as { discountFeeHeadLabel?: string | null }).discountFeeHeadLabel ?? null,
          discountRemarks: (student.fee as { discountRemarks?: string | null }).discountRemarks ?? null,
        }
      : null,
    payments: paymentsBundle.payments,
    attendanceTrends,
    academicPerformance,
    certificates: certificates.map((c) => ({
      id: c.id,
      title: c.title,
      issuedDate:
        c.issuedDate instanceof Date ? c.issuedDate.toISOString().slice(0, 10) : String(c.issuedDate),
      issuedBy: c.issuedBy?.name ?? null,
      certificateUrl: c.certificateUrl ?? null,
    })),
  };
}
