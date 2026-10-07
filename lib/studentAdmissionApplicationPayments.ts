import prisma from "@/lib/db";
import { admissionFeeGatewayFromApplication } from "@/lib/loadAdmissionFeeDayReportTx";

export type StudentProfilePaymentRow = {
  id: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  feeTypeName?: string;
  feeTypeAmount?: number;
  feeAllocations?: Array<{ name: string; amount: number }>;
};

const applicationFeeSelect = {
  id: true,
  applicationFee: true,
  admissionFee: true,
  applicationFeePaid: true,
  admissionFeePaid: true,
  applicationFeePaidAt: true,
  admissionFeePaidAt: true,
  applicationFeePaymentMode: true,
  applicationFeePaymentMethod: true,
  admissionFeePaymentMode: true,
  admissionFeePaymentMethod: true,
} as const;

export type StudentApplicationFeeSnapshot = {
  applicationFee: number | null;
  admissionFee: number | null;
  applicationFeePaid: boolean;
  admissionFeePaid: boolean;
  applicationFeePaidAt: Date | null;
  admissionFeePaidAt: Date | null;
  applicationFeePaymentMode: string | null;
  applicationFeePaymentMethod: string | null;
  admissionFeePaymentMode: string | null;
  admissionFeePaymentMethod: string | null;
};

function parseRefFromPaymentMethod(paymentMethod: string | null | undefined): string | null {
  if (!paymentMethod) return null;
  const refMatch = String(paymentMethod).match(/REF:([^|]+)/i);
  return refMatch?.[1]?.trim() || null;
}

function paymentMethodLabel(
  paymentMode: string | null | undefined,
  paymentMethod: string | null | undefined
): string {
  return admissionFeeGatewayFromApplication(paymentMode, paymentMethod);
}

/** Resolve display amounts from Student row + linked admission application. */
export function resolveStudentAdmissionApplicationFees(
  student: { applicationFee?: number | null; admissionFee?: number | null },
  application: Partial<StudentApplicationFeeSnapshot> | null | undefined
): { applicationFee: number | null; admissionFee: number | null } {
  const appFee =
    student.applicationFee ??
    (application?.applicationFeePaid && (application.applicationFee ?? 0) > 0
      ? application.applicationFee
      : null) ??
    null;
  const admFee =
    student.admissionFee ??
    (application?.admissionFeePaid && (application.admissionFee ?? 0) > 0
      ? application.admissionFee
      : null) ??
    null;
  return { applicationFee: appFee, admissionFee: admFee };
}

/** Paid application/admission fees recorded on StudentApplication (not in Payment table). */
export function admissionApplicationPaymentsFromSnapshot(
  app: (Partial<StudentApplicationFeeSnapshot> & { id: string }) | null | undefined
): StudentProfilePaymentRow[] {
  if (!app) return [];

  const rows: StudentProfilePaymentRow[] = [];

  if (app.applicationFeePaid && (app.applicationFee ?? 0) > 0) {
    const amount = Number(app.applicationFee);
    rows.push({
      id: `application-app-${app.id}`,
      amount,
      status: "SUCCESS",
      method: paymentMethodLabel(app.applicationFeePaymentMode, app.applicationFeePaymentMethod),
      createdAt: (app.applicationFeePaidAt ?? new Date()).toISOString(),
      transactionId: parseRefFromPaymentMethod(app.applicationFeePaymentMethod),
      feeTypeName: "Application Fee",
      feeTypeAmount: amount,
      feeAllocations: [{ name: "Application Fee", amount }],
    });
  }

  if (app.admissionFeePaid && (app.admissionFee ?? 0) > 0) {
    const amount = Number(app.admissionFee);
    rows.push({
      id: `admission-app-${app.id}`,
      amount,
      status: "SUCCESS",
      method: paymentMethodLabel(app.admissionFeePaymentMode, app.admissionFeePaymentMethod),
      createdAt: (app.admissionFeePaidAt ?? new Date()).toISOString(),
      transactionId: parseRefFromPaymentMethod(app.admissionFeePaymentMethod),
      feeTypeName: "Admission Fee",
      feeTypeAmount: amount,
      feeAllocations: [{ name: "Admission Fee", amount }],
    });
  }

  return rows;
}

export async function loadStudentApplicationFeeSnapshot(
  studentId: string,
  schoolId?: string,
  aadhaarNo?: string | null
): Promise<(StudentApplicationFeeSnapshot & { id: string }) | null> {
  const byStudent = await prisma.studentApplication.findFirst({
    where: { studentId },
    select: applicationFeeSelect,
  });
  if (byStudent) return byStudent;

  if (schoolId && aadhaarNo) {
    return prisma.studentApplication.findUnique({
      where: { schoolId_aadharNo: { schoolId, aadharNo: aadhaarNo } },
      select: applicationFeeSelect,
    });
  }

  return null;
}

export async function loadStudentAdmissionApplicationPayments(
  studentId: string,
  schoolId?: string,
  aadhaarNo?: string | null
): Promise<StudentProfilePaymentRow[]> {
  const app = await loadStudentApplicationFeeSnapshot(studentId, schoolId, aadhaarNo);
  return admissionApplicationPaymentsFromSnapshot(app);
}

export function mergeStudentProfilePayments(
  gatewayPayments: StudentProfilePaymentRow[],
  admissionApplicationPayments: StudentProfilePaymentRow[]
): StudentProfilePaymentRow[] {
  if (admissionApplicationPayments.length === 0) return gatewayPayments;
  return [...gatewayPayments, ...admissionApplicationPayments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
