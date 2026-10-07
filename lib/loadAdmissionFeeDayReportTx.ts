import prisma from "@/lib/db";
import type { DayReportTx } from "@/lib/feeDayReportExcel";

/** Map admission-application payment fields to Payment.gateway codes used by fee reports. */
export function admissionFeeGatewayFromApplication(
  paymentMode: string | null | undefined,
  paymentMethod: string | null | undefined
): string {
  const mode = String(paymentMode ?? "")
    .trim()
    .toUpperCase();
  const methodBase =
    String(paymentMethod ?? "")
      .trim()
      .toUpperCase()
      .split("|")[0]
      ?.trim() ?? "CASH";

  if (methodBase === "CHEQUE" || methodBase === "CHQ") return "OFFLINE_CHEQUE";
  if (methodBase === "DD") return "OFFLINE_DD";
  if (methodBase === "UPI") return mode === "ONLINE" ? "HYPERPG" : "OFFLINE_UPI";
  if (methodBase === "BANK_TRANSFER" || methodBase === "BANK") return "OFFLINE_BANK_TRANSFER";
  if (methodBase === "CARD") return mode === "ONLINE" ? "HYPERPG" : "OFFLINE_CARD";
  if (mode === "ONLINE") return "HYPERPG";
  return "OFFLINE_CASH";
}

function parseRefFromPaymentMethod(paymentMethod: string | null | undefined): string | null {
  if (!paymentMethod) return null;
  const refMatch = String(paymentMethod).match(/REF:([^|]+)/i);
  return refMatch?.[1]?.trim() || null;
}

/** Paid admission fees from applications + student records for day/month fee reports. */
export async function loadAdmissionFeeDayReportTransactions(
  schoolId: string,
  from: Date,
  to: Date
): Promise<DayReportTx[]> {
  const txs: DayReportTx[] = [];

  const apps = await prisma.studentApplication.findMany({
    where: {
      schoolId,
      admissionFeePaid: true,
      admissionFeePaidAt: { not: null, gte: from, lte: to },
      admissionFee: { gt: 0 },
    },
    select: {
      id: true,
      applicationNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
      admissionFee: true,
      admissionFeePaidAt: true,
      admissionFeePaymentMode: true,
      admissionFeePaymentMethod: true,
      class: { select: { id: true, name: true, section: true } },
      student: { select: { admissionNumber: true } },
    },
    orderBy: { admissionFeePaidAt: "asc" },
  });

  for (const a of apps) {
    const name = [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ").trim() || "-";
    const amt = Number(a.admissionFee) || 0;
    if (amt <= 0) continue;
    txs.push({
      id: `admission-app-${a.id}`,
      amount: amt,
      gateway: admissionFeeGatewayFromApplication(
        a.admissionFeePaymentMode,
        a.admissionFeePaymentMethod
      ),
      createdAt: a.admissionFeePaidAt!.toISOString(),
      feeTypeName: "Admission Fee",
      transactionId: parseRefFromPaymentMethod(a.admissionFeePaymentMethod),
      feeAllocations: [{ name: "Admission Fee", amount: amt }],
      student: {
        admissionNumber: a.student?.admissionNumber ?? a.applicationNo,
        user: { name },
        class: a.class
          ? { id: a.class.id, name: a.class.name, section: a.class.section }
          : null,
      },
    });
  }

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      admissionFee: { gt: 0 },
      createdAt: { gte: from, lte: to },
      OR: [{ application: null }, { application: { admissionFeePaid: false } }],
    },
    select: {
      id: true,
      admissionNumber: true,
      admissionFee: true,
      createdAt: true,
      user: { select: { name: true } },
      class: { select: { id: true, name: true, section: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const s of students) {
    const amt = Number(s.admissionFee) || 0;
    if (amt <= 0) continue;
    txs.push({
      id: `admission-student-${s.id}`,
      amount: amt,
      gateway: "OFFLINE_CASH",
      createdAt: s.createdAt.toISOString(),
      feeTypeName: "Admission Fee",
      transactionId: null,
      feeAllocations: [{ name: "Admission Fee", amount: amt }],
      student: {
        admissionNumber: s.admissionNumber,
        user: { name: s.user?.name ?? null },
        class: s.class,
      },
    });
  }

  return txs;
}
