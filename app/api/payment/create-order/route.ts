import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";
import type { Prisma } from "@prisma/client";
import { extraFeeAppliesToStudentResidency } from "@/lib/extraFeeResidencyScope";

const hyperpgBaseUrl = process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in";
const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgClientId = process.env.HYPERPG_CLIENT_ID || "test";
// JusPay/HyperPG Session API: Basic Base64(apiKey + ":") + mandatory x-merchantid header
const hyperpgAuthStyle = process.env.HYPERPG_AUTH_STYLE || "api_key";

/** HyperPG requires order_id: alphanumeric, max 20 chars */
function generateOrderId(): string {
  const t = Date.now().toString(36).replace(/[^a-z0-9]/g, "").slice(-8);
  const r = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(2, 6);
  return `TML${t}${r}`.slice(0, 20);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json(
      { error: "Only students can create payment orders" },
      { status: 403 }
    );
  }

  // Guarded above: `studentId` is required for students.
  const studentAllocId = session.user.studentId as string;

  try {
    const body = await req.json();
    const rawAmount = body.amount;
    const returnPath = (body.return_path as string) || "/payments";
    const eventRegistrationId = typeof body.event_registration_id === "string" && body.event_registration_id ? body.event_registration_id : null;
    const feeSelection = Array.isArray(body.fee_selection) ? body.fee_selection : undefined;

    const amountNumber =
      typeof rawAmount === "string" ? parseFloat(rawAmount) : rawAmount;

    if (!amountNumber || isNaN(amountNumber) || amountNumber < 1) {
      return NextResponse.json(
        { error: "Invalid amount (minimum INR 1)" },
        { status: 400 }
      );
    }

    // For fee payments (no workshop): enforce amount does not exceed remaining fee
    if (!eventRegistrationId) {
      const fee = await prisma.studentFee.findUnique({
        where: { studentId: session.user.studentId },
        select: { remainingFee: true },
      });
      const maxAllowed = fee ? fee.remainingFee : 0;
      if (amountNumber > maxAllowed + 0.01) {
        return NextResponse.json(
          { error: `Amount cannot exceed remaining fee (₹${maxAllowed.toFixed(2)})` },
          { status: 400 }
        );
      }
    }

    const student = await prisma.student.findUnique({
      where: { id: session.user.studentId },
      select: {
        id: true,
        schoolId: true,
        classId: true,
        residencyType: true,
        class: { select: { id: true, section: true } },
        phoneNo: true,
        fatherName: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // If this is a FEES payment, we will pre-create allocations for the pending payment.
    // Allocations only affect due-by-head after payment is verified and marked SUCCESS.
    let allocationsToCreate:
      | Array<{
          headType: "BASE_COMPONENT" | "EXTRA_FEE";
          componentIndex?: number | null;
          componentName?: string | null;
          extraFeeId?: string | null;
          allocatedAmount: number;
        }>
      | null = null;

    if (!eventRegistrationId) {
      const fee = await prisma.studentFee.findUnique({
        where: { studentId: session.user.studentId },
        select: {
          amountPaid: true,
          finalFee: true,
          totalFee: true,
          remainingFee: true,
          discountPercent: true,
        },
      });

      if (!fee) {
        return NextResponse.json(
          { error: "Fee record not found for this student" },
          { status: 404 }
        );
      }

      type SelectedHead =
        | { headType: "BASE_COMPONENT"; componentIndex: number }
        | { headType: "EXTRA_FEE"; extraFeeId: string };

      const normalizedSelectedHeads: SelectedHead[] = Array.isArray(feeSelection)
        ? feeSelection
            .map((h: any): SelectedHead | null => {
              if (!h || typeof h !== "object") return null;
              if (h.headType === "BASE_COMPONENT" && typeof h.componentIndex === "number") {
                return { headType: "BASE_COMPONENT", componentIndex: h.componentIndex };
              }
              if (h.headType === "EXTRA_FEE" && typeof h.extraFeeId === "string") {
                return { headType: "EXTRA_FEE", extraFeeId: h.extraFeeId };
              }
              return null;
            })
            .filter((x): x is SelectedHead => x !== null)
        : [];

      if (normalizedSelectedHeads.length === 0) {
        return NextResponse.json({ error: "Please select at least one fee type before paying." }, { status: 400 });
      }

      const structMult = structureMultiplierAfterDiscount(fee.discountPercent);

      const classId = student.classId ?? null;
      const classSection = student.class?.section ?? null;

      const classFeeStructure = classId
        ? await prisma.classFeeStructure.findUnique({
            where: { classId },
            select: { components: true },
          })
        : null;

      const baseComponents =
        ((classFeeStructure?.components as Array<{ name: string; amount: number }> | null) ?? []).map(
          (c) => ({
            name: String(c.name),
            amount: Number(c.amount) || 0,
          })
        );

      const extraFeesRaw = await prisma.extraFee.findMany({
        where: {
          schoolId: student.schoolId,
          OR: [
            { targetType: "SCHOOL" },
            ...(classId ? [{ targetType: "CLASS", targetClassId: classId }] : []),
            ...(classId && classSection
              ? [
                  {
                    targetType: "SECTION",
                    targetClassId: classId,
                    targetSection: classSection,
                  },
                ]
              : []),
            { targetType: "STUDENT", targetStudentId: student.id },
          ],
        },
        select: { id: true, name: true, amount: true, targetType: true, residencyScope: true },
      });
      const residency = student.residencyType ?? "Day Scholar";
      const extraFees = extraFeesRaw.filter((ef) =>
        extraFeeAppliesToStudentResidency(ef.residencyScope, residency)
      );

      const getHeadKey = (h: SelectedHead) => {
        if (h.headType === "BASE_COMPONENT") return `BASE:${h.componentIndex}`;
        return `EXTRA:${h.extraFeeId}`;
      };

      type Head = { key: string; headType: "BASE_COMPONENT" | "EXTRA_FEE"; snapshotDue: number; componentIndex?: number; componentName?: string; extraFeeId?: string };

      const allHeads: Head[] = [
        ...baseComponents.map((c, idx): Head => ({
          key: `BASE:${idx}`,
          headType: "BASE_COMPONENT",
          snapshotDue: c.amount * structMult,
          componentIndex: idx,
          componentName: c.name,
        })),
        ...extraFees.map((ef): Head => ({
          key: `EXTRA:${ef.id}`,
          headType: "EXTRA_FEE",
          snapshotDue: Number(ef.amount) || 0,
          extraFeeId: ef.id,
        })),
      ];

      const [paymentAllocations, refundAllocations] = await Promise.all([
        prisma.paymentFeeAllocation.findMany({
          where: {
            studentId: student.id,
            allocationType: "PAYMENT",
            payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
          },
          select: { headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
        }),
        prisma.paymentFeeAllocation.findMany({
          where: {
            studentId: student.id,
            allocationType: "REFUND",
            payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
          },
          select: { headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
        }),
      ]);

      const netPaidByHead = new Map<string, number>();
      for (const a of paymentAllocations) {
        const key =
          a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
        netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + a.allocatedAmount);
      }
      for (const a of refundAllocations) {
        const key =
          a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
        netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - a.allocatedAmount);
      }

      const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
      const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
      const totalSnapshotDue = Math.max(fee.finalFee, 0);

      const headsWithDueBefore = allHeads.map((h) => {
        const paidAlloc = netPaidByHead.get(h.key) ?? 0;
        const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
        const dueBefore = Math.max(h.snapshotDue - (paidAlloc + paidLegacy), 0);
        return { ...h, dueBefore, paidAlloc, paidLegacy };
      });

      const selectedHeadKeys = new Set<string>(
        normalizedSelectedHeads.length > 0 ? normalizedSelectedHeads.map(getHeadKey) : headsWithDueBefore.map((h) => h.key)
      );

      const selectedHeads = headsWithDueBefore.filter((h) => selectedHeadKeys.has(h.key));
      const unselectedHeads = headsWithDueBefore.filter((h) => !selectedHeadKeys.has(h.key));

      const selectedDueSum = selectedHeads.reduce((s, h) => s + h.dueBefore, 0);
      const unselectedDueSum = unselectedHeads.reduce((s, h) => s + h.dueBefore, 0);
      const totalDueSum = headsWithDueBefore.reduce((s, h) => s + h.dueBefore, 0);

      if (totalDueSum <= 0.00001) {
        return NextResponse.json({ error: "Nothing due for this student" }, { status: 400 });
      }

      const allocateProportional = (
        amountToAlloc: number,
        heads: Array<{ key: string; dueBefore: number }>
      ): Map<string, number> => {
        const sum = heads.reduce((s, h) => s + h.dueBefore, 0);
        const out = new Map<string, number>();
        if (amountToAlloc <= 0 || sum <= 0) return out;
        const eligible = heads.filter((h) => h.dueBefore > 0);
        if (eligible.length === 0) return out;
        let remaining = amountToAlloc;
        for (let i = 0; i < eligible.length; i++) {
          const h = eligible[i];
        const value =
          i === eligible.length - 1
            ? Math.min(remaining, h.dueBefore)
            : (amountToAlloc * h.dueBefore) / sum;
        out.set(h.key, (out.get(h.key) ?? 0) + value);
        remaining -= value;
        }
        return out;
      };

      const allocateSelected = Math.min(amountNumber, selectedDueSum);
      const spill = amountNumber - allocateSelected;

      const allocationsByKey = new Map<string, number>();

      for (const [k, v] of allocateProportional(allocateSelected, selectedHeads)) {
        allocationsByKey.set(k, v);
      }

      if (spill > 0.00001) {
        if (unselectedDueSum <= 0) {
          return NextResponse.json(
            { error: "No other fee heads to allocate spill amount" },
            { status: 400 }
          );
        }
        for (const [k, v] of allocateProportional(spill, unselectedHeads)) {
          allocationsByKey.set(k, (allocationsByKey.get(k) ?? 0) + v);
        }
      }

      allocationsToCreate = Array.from(allocationsByKey.entries())
        .filter(([, v]) => v > 0.00001)
        .map(([key, allocatedAmount]) => {
          if (key.startsWith("BASE:")) {
            const componentIndex = Number(key.slice("BASE:".length));
            const componentName = baseComponents[componentIndex]?.name ?? `Component ${componentIndex + 1}`;
            return {
              headType: "BASE_COMPONENT" as const,
              componentIndex,
              componentName,
              extraFeeId: null,
              allocatedAmount,
            };
          }
          const extraFeeId = key.slice("EXTRA:".length);
          return {
            headType: "EXTRA_FEE" as const,
            componentIndex: null,
            componentName: null,
            extraFeeId,
            allocatedAmount,
          };
        });
    }

    const useGlobalOnly = process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" || process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
    const settings = useGlobalOnly ? null : await prisma.schoolSettings.findUnique({
      where: { schoolId: student.schoolId },
    });

    const merchantId = useGlobalOnly
      ? (globalHyperpgMerchantId?.trim() ?? "")
      : (settings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim());
    const apiKey = useGlobalOnly
      ? (globalHyperpgApiKey?.trim() ?? "")
      : (settings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim());

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Payment not configured for this school. School admin must add HyperPG API Key in School Settings (or set HYPERPG_API_KEY in .env for fallback).",
        },
        { status: 500 }
      );
    }
    const orderId = generateOrderId();
    const baseUrl =
      process.env.HYPERPG_RETURN_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
    const pathOnly = path.split("?")[0].replace(/\/$/, "") || "/payments";
    const returnUrl = `${baseUrl.replace(/\/$/, "")}${pathOnly}`;

    const nameParts = (student.user?.name || student.fatherName || "Student")
      .trim()
      .split(/\s+/);
    const firstName = (nameParts[0] || "Student").replace(/[^a-zA-Z0-9().\-_\s]/g, "").slice(0, 255);
    const lastName = nameParts
      .slice(1)
      .join(" ")
      .replace(/[^a-zA-Z0-9().\-_\s]/g, "")
      .slice(0, 255) || ".";

    const phone = (student.phoneNo || "9999999999").replace(/\D/g, "").slice(0, 10) || "9999999999";
    const email = (session.user.email || student.user?.email || "student@timelly.in").slice(0, 300);
    const customerId = String(session.user.studentId).slice(0, 128);

    const sessionPayload: Record<string, unknown> = {
      mobile_country_code: "+91",
      payment_page_client_id: hyperpgClientId,
      amount: Number(amountNumber.toFixed(2)),
      currency: "INR",
      action: "paymentPage",
      customer_email: email,
      customer_phone: phone,
      first_name: firstName,
      last_name: lastName,
      description: eventRegistrationId ? "Workshop payment - Timelly" : "Fee payment - Timelly",
      customer_id: customerId,
      order_id: orderId,
      return_url: returnUrl,
      send_mail: false,
      send_sms: false,
      send_whatsapp: false,
    };
    const expiryMins = process.env.HYPERPG_LINK_EXPIRY_MINS;
    if (expiryMins) sessionPayload["metadata.expiryInMins"] = String(expiryMins);
    const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
    const merchantIdClean = (merchantId || "").trim().replace(/^["']|["']$/g, "");
    
    const auth =
      hyperpgAuthStyle === "merchant_key" && merchantIdClean
        ? Buffer.from(`${merchantIdClean}:${apiKeyClean}`).toString("base64")
        : Buffer.from(apiKeyClean, "utf8").toString("base64");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    };
    if (merchantIdClean && hyperpgAuthStyle === "merchant_key") {
      headers["x-merchantid"] = merchantIdClean;
    }
    const res = await fetch(`${hyperpgBaseUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify(sessionPayload),
      
    });

    const errText = await res.text();
    if (!res.ok) {
      console.error("HyperPG session error:", res.status, errText);
      console.error("HyperPG request URL:", hyperpgBaseUrl + "/session");
      console.error("HyperPG auth style:", hyperpgAuthStyle, "Authorization length:", headers.Authorization?.length ?? 0);
      let details = errText.slice(0, 500);
      try {
        const j = JSON.parse(errText) as Record<string, unknown>;
        if (j && typeof j.error_message === "string") details = j.error_message;
        else if (j && typeof j.error_code === "string") details = j.error_code;
        else if (j && typeof j.message === "string") details = j.message;
      } catch (_) {}
      const hint =
        res.status === 403 || res.status === 401
          ? " Confirm with HyperPG: (1) This Merchant ID and API Key are for the correct account (e.g. school linked to your email). (2) HYPERPG_MERCHANT_ID and HYPERPG_API_KEY in .env match the credentials that work in Postman. (3) If they use whitelisting, your server IP or domain may need to be whitelisted."
          : "";
      return NextResponse.json(
        {
          error: "Payment gateway error",
          details: details + hint,
          statusFromGateway: res.status,
        },
        { status: 500 }
      );
    }

    let data: { payment_links?: { web?: string }; id?: string; status?: string; status_id?: number };
    try {
      data = JSON.parse(errText);
    } catch {
      return NextResponse.json(
        { error: "Invalid response from payment gateway" },
        { status: 500 }
      );
    }

    const paymentUrl =
      data.payment_links?.web ||
      (data.payment_links as Record<string, string> | undefined)?.payment_page ||
      null;

    if (!paymentUrl) {
      console.error("HyperPG response missing payment_links.web:", data);
      return NextResponse.json(
        { error: "Payment gateway did not return payment URL" },
        { status: 500 }
      );
    }

    // Store Payment in DB (status PENDING) - will be updated on verify
    const payment = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId: session.user.studentId,
          amount: amountNumber,
          gateway: "HYPERPG",
          hyperpgOrderId: data.id || null,
          hyperpgStatus: data.status || null,
          hyperpgStatusId: typeof data.status_id === "number" ? data.status_id : null,
          status: "PENDING",
          transactionId: orderId,
          ...(eventRegistrationId && { eventRegistrationId }),
        } as Prisma.PaymentUncheckedCreateInput,
      });

      if (!eventRegistrationId && allocationsToCreate && allocationsToCreate.length > 0) {
        await tx.paymentFeeAllocation.createMany({
          data: allocationsToCreate.map((a) => ({
            paymentId: payment.id,
            studentId: studentAllocId,
            allocationType: "PAYMENT",
            allocatedAmount: a.allocatedAmount,
            headType: a.headType,
            componentIndex: a.componentIndex ?? null,
            componentName: a.componentName ?? null,
            extraFeeId: a.extraFeeId ?? null,
          })),
        });
      }

      return payment;
    });

    return NextResponse.json({
      gateway: "HYPERPG",
      id: data.id || orderId,
      order_id: orderId,
      hyperpg_order_id: data.id || null,
      amount: amountNumber,
      payment_url: paymentUrl,
    });
  } catch (err: unknown) {
    console.error("Order creation error:", err);
    return NextResponse.json(
      {
        error: "Failed to create order",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
