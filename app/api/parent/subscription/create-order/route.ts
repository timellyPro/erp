import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveHyperpgBaseUrl } from "@/lib/hyperpgConfig";
import {
  hyperpgBasicAuthBase64,
  hyperpgSessionJsonHeaders,
  resolveHyperpgPaymentPageClientId,
} from "@/lib/hyperpgAuth";
import {
  assertHyperpgSessionReturnUrl,
  HYPERPG_SANDBOX_PLACEHOLDER_RETURN_URL,
  hyperpgSandboxPlaceholderReturnEnabled,
  resolveHyperpgAppBaseUrl,
} from "@/lib/hyperpgReturnUrl";
import { getSchoolHyperpgBaseUrlRaw } from "@/lib/schoolHyperpgBaseUrlRaw";

const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgAuthStyle = process.env.HYPERPG_AUTH_STYLE || "api_key";

function generateOrderId(): string {
  const t = Date.now().toString(36).replace(/[^a-z0-9]/g, "").slice(-8);
  const r = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(2, 6);
  return `SUB${t}${r}`.slice(0, 20);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedAmount = typeof body.amount === "number" ? body.amount : undefined;
    const returnPath = (body.return_path as string) || "/frontend/pages/parent?tab=profile";

    const student = await prisma.student.findUnique({
      where: { id: session.user.studentId },
      select: {
        id: true,
        schoolId: true,
        phoneNo: true,
        fatherName: true,
        user: { select: { name: true, email: true } },
        school: {
          select: {
            billingMode: true,
            parentSubscriptionAmount: true,
          },
        },
      },
    });
    if (!student || !student.school) {
      return NextResponse.json({ error: "Student or school not found" }, { status: 404 });
    }

    if (student.school.billingMode === "SCHOOL_PAID") {
      return NextResponse.json(
        { error: "This school is already on paid mode. No parent subscription required." },
        { status: 400 }
      );
    }

    const baseAmount =
      requestedAmount && requestedAmount > 0
        ? requestedAmount
        : student.school.parentSubscriptionAmount ?? 0;

    if (!baseAmount || baseAmount < 1) {
      return NextResponse.json(
        { error: "Invalid subscription amount. Please contact school or superadmin." },
        { status: 400 }
      );
    }

    const useGlobalOnly =
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "true" ||
      process.env.HYPERPG_USE_GLOBAL_CREDENTIALS === "1";
    const schoolSettings = useGlobalOnly
      ? null
      : await prisma.schoolSettings.findUnique({
          where: { schoolId: student.schoolId },
          select: {
            hyperpgMerchantId: true,
            hyperpgApiKey: true,
          },
        });

    const schoolBaseUrl = useGlobalOnly ? null : await getSchoolHyperpgBaseUrlRaw(student.schoolId);

    const hyperpgBaseUrl = resolveHyperpgBaseUrl({
      useGlobalOnly,
      schoolHyperpgBaseUrl: schoolBaseUrl,
    });

    const merchantId = useGlobalOnly
      ? (globalHyperpgMerchantId?.trim() ?? "")
      : (schoolSettings?.hyperpgMerchantId?.trim() || globalHyperpgMerchantId?.trim() || "");
    const apiKey = useGlobalOnly
      ? (globalHyperpgApiKey?.trim() ?? "")
      : (schoolSettings?.hyperpgApiKey?.trim() || globalHyperpgApiKey?.trim() || "");

    if (!apiKey || !merchantId) {
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured for this school. Superadmin must set HyperPG Merchant ID, API Key, and API URL in Subscriptions, or school admin in Settings.",
        },
        { status: 500 }
      );
    }

    const amountNumber = Number(baseAmount.toFixed(2));
    const orderId = generateOrderId();

    const baseUrl = resolveHyperpgAppBaseUrl();
    const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
    const pathOnly = path.split("?")[0].replace(/\/$/, "") || "/frontend/pages/parent?tab=profile";
    let returnUrl = `${baseUrl.replace(/\/$/, "")}${pathOnly}`;
    const returnCheck = assertHyperpgSessionReturnUrl(returnUrl);
    const sandboxApi = hyperpgBaseUrl.includes("sandbox.hyperpg.in");
    const useSandboxPlaceholder =
      !returnCheck.ok && sandboxApi && hyperpgSandboxPlaceholderReturnEnabled();
    if (!returnCheck.ok && !useSandboxPlaceholder) {
      return NextResponse.json({ error: returnCheck.message }, { status: 400 });
    }
    if (useSandboxPlaceholder) {
      returnUrl = HYPERPG_SANDBOX_PLACEHOLDER_RETURN_URL;
      console.warn(
        "[HyperPG] HYPERPG_USE_SANDBOX_PLACEHOLDER_RETURN: session return_url set to sandbox.hyperpg.in (post-payment redirect will not return to your dev server)."
      );
    }

    const nameParts = (student.user?.name || student.fatherName || "Parent")
      .trim()
      .split(/\s+/);
    const firstName = (nameParts[0] || "Parent").replace(/[^a-zA-Z0-9().\-_\s]/g, "").slice(0, 255);
    const lastName = nameParts
      .slice(1)
      .join(" ")
      .replace(/[^a-zA-Z0-9().\-_\s]/g, "")
      .slice(0, 255) || ".";

    const phone = (student.phoneNo || "9999999999").replace(/\D/g, "").slice(0, 10) || "9999999999";
    const email = (session.user.email || student.user?.email || "parent@timelly.in").slice(0, 300);
    const customerId = String(session.user.studentId).slice(0, 128);

    const merchantIdClean = merchantId.replace(/^["']|["']$/g, "").trim();
    const paymentPageClientId = resolveHyperpgPaymentPageClientId(merchantIdClean);

    const sessionPayload: Record<string, unknown> = {
      mobile_country_code: "+91",
      payment_page_client_id: paymentPageClientId,
      amount: amountNumber.toFixed(2),
      currency: "INR",
      action: "paymentPage",
      customer_email: email,
      customer_phone: phone,
      first_name: firstName,
      last_name: lastName,
      description: "Parent subscription - Timelly",
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

    const auth = hyperpgBasicAuthBase64({
      apiKeyClean,
      merchantIdClean,
      authStyle: hyperpgAuthStyle,
    });
    const headers = hyperpgSessionJsonHeaders(auth, merchantIdClean, customerId);

    const res = await fetch(`${hyperpgBaseUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify(sessionPayload),
    });

    const errText = await res.text();
    if (!res.ok) {
      console.error("HyperPG subscription session error:", res.status, errText);
      let details = errText.slice(0, 500);
      try {
        const j = JSON.parse(errText) as Record<string, unknown>;
        if (typeof j.error_message === "string") details = j.error_message;
        else if (typeof j.error_code === "string") details = j.error_code;
        else if (typeof j.message === "string") details = j.message;
      } catch {
        // ignore
      }
      const html403 =
        res.status === 403 &&
        (errText.includes("<title>403 Forbidden</title>") || errText.includes("403 Forbidden"));
      const detailsOut =
        details +
        (html403
          ? " HyperPG often returns HTML 403 when return_url uses localhost or a private IP. Set HYPERPG_RETURN_URL to a public https tunnel URL for local dev."
          : "");
      return NextResponse.json(
        {
          error: "Payment gateway error",
          details: detailsOut,
          statusFromGateway: res.status,
        },
        { status: 500 }
      );
    }

    let data: { payment_links?: { web?: string }; id?: string };
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
      return NextResponse.json(
        { error: "Payment gateway did not return payment URL" },
        { status: 500 }
      );
    }

    await prisma.payment.create({
      data: {
        studentId: session.user.studentId,
        amount: amountNumber,
        gateway: "HYPERPG",
        hyperpgOrderId: data.id || null,
        status: "PENDING",
        transactionId: orderId,
        purpose: "PARENT_SUBSCRIPTION",
      },
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
    console.error("Parent subscription order error:", err);
    return NextResponse.json(
      {
        error: "Failed to create subscription order",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

