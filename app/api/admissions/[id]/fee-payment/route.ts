import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../../_utils";

type FeeType = "APPLICATION" | "ADMISSION";

function parseString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  return v || fallback;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const feeType = String(body?.feeType ?? "").toUpperCase() as FeeType;
    if (feeType !== "APPLICATION" && feeType !== "ADMISSION") {
      return NextResponse.json(
        { message: "feeType must be APPLICATION or ADMISSION" },
        { status: 400 }
      );
    }

    const paymentModeRaw = parseString(body?.paymentMode, "OFFLINE").toUpperCase();
    const paymentMethodRaw = parseString(body?.paymentMethod, "CASH").toUpperCase();
    const remarks = parseString(body?.remarks, "");
    const referenceNo = parseString(body?.referenceNo, "");
    const paymentMode = paymentModeRaw || "OFFLINE";
    const paymentMethod = paymentMethodRaw || "CASH";
    const validModes = ["CASH", "CHEQUE", "UPI", "BANK_TRANSFER", "CARD"];
    if (!validModes.includes(paymentMethod)) {
      return NextResponse.json(
        { message: "paymentMethod must be CASH, CHEQUE, UPI, BANK_TRANSFER or CARD" },
        { status: 400 }
      );
    }
    if ((paymentMethod === "UPI" || paymentMethod === "BANK_TRANSFER") && !referenceNo) {
      return NextResponse.json(
        { message: "Reference number / UTR is required for UPI and Bank Transfer" },
        { status: 400 }
      );
    }

    const admission = await prisma.studentApplication.findFirst({
      where: { id, schoolId },
      select: {
        id: true,
        applicationFee: true,
        admissionFee: true,
        applicationFeePaid: true,
        admissionFeePaid: true,
      },
    });

    if (!admission) {
      return NextResponse.json({ message: "Admission not found" }, { status: 404 });
    }

    const now = new Date();
    if (feeType === "APPLICATION") {
      if (!admission.applicationFee || Number(admission.applicationFee) <= 0) {
        return NextResponse.json(
          { message: "Application fee amount is not set" },
          { status: 400 }
        );
      }
      if (admission.applicationFeePaid) {
        return NextResponse.json(
          { message: "Application fee is already paid" },
          { status: 400 }
        );
      }

      const updated = await prisma.studentApplication.update({
        where: { id: admission.id },
        data: {
          applicationFeePaid: true,
          applicationFeePaidAt: now,
          applicationFeePaymentMode: paymentMode,
          applicationFeePaymentMethod: referenceNo
            ? `${paymentMethod} | REF:${referenceNo}${remarks ? ` | REMARKS:${remarks}` : ""}`
            : `${paymentMethod}${remarks ? ` | REMARKS:${remarks}` : ""}`,
        },
        select: {
          id: true,
          applicationFeePaid: true,
          applicationFeePaidAt: true,
          applicationFeePaymentMode: true,
          applicationFeePaymentMethod: true,
          admissionFeePaid: true,
          admissionFeePaidAt: true,
          admissionFeePaymentMode: true,
          admissionFeePaymentMethod: true,
        },
      });
      return NextResponse.json(
        { message: "Application fee marked as paid", application: updated },
        { status: 200 }
      );
    }

    if (!admission.admissionFee || Number(admission.admissionFee) <= 0) {
      return NextResponse.json(
        { message: "Admission fee amount is not set" },
        { status: 400 }
      );
    }
    if (admission.admissionFeePaid) {
      return NextResponse.json(
        { message: "Admission fee is already paid" },
        { status: 400 }
      );
    }

    const updated = await prisma.studentApplication.update({
      where: { id: admission.id },
      data: {
        admissionFeePaid: true,
        admissionFeePaidAt: now,
        admissionFeePaymentMode: paymentMode,
        admissionFeePaymentMethod: referenceNo
          ? `${paymentMethod} | REF:${referenceNo}${remarks ? ` | REMARKS:${remarks}` : ""}`
          : `${paymentMethod}${remarks ? ` | REMARKS:${remarks}` : ""}`,
      },
      select: {
        id: true,
        applicationFeePaid: true,
        applicationFeePaidAt: true,
        applicationFeePaymentMode: true,
        applicationFeePaymentMethod: true,
        admissionFeePaid: true,
        admissionFeePaidAt: true,
        admissionFeePaymentMode: true,
        admissionFeePaymentMethod: true,
      },
    });
    return NextResponse.json(
      { message: "Admission fee marked as paid", application: updated },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}
