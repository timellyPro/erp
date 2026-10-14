import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const hyperpgBaseUrl = process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in";
const globalHyperpgMerchantId = process.env.HYPERPG_MERCHANT_ID;
const globalHyperpgApiKey = process.env.HYPERPG_API_KEY;
const hyperpgClientId = process.env.HYPERPG_CLIENT_ID || "test";
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

  const orderLimit = await rateLimit(
    rateLimitKey("parent-subscription-create-order", session.user.studentId),
    20,
    10 * 60
  );
  if (!orderLimit.allowed) {
    return NextResponse.json(
      { error: `Too many payment attempts. Please try again in ${Math.ceil(orderLimit.resetInSeconds / 60)} minute(s).` },
      { status: 429 }
    );
  }

  try {
    const createOrderBodySchema = z.object({
      amount: z.union([z.number(), z.string()]).optional(),
      return_path: z.string().optional(),
    });
    const parsedBody = createOrderBodySchema.safeParse(await req.json().catch(() => ({})));
    const body = parsedBody.success ? parsedBody.data : {};
    const requestedAmount = typeof body.amount === "number" ? body.amount : undefined;
    const returnPath = body.return_path || "/parent?tab=profile";

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

    const merchantId = globalHyperpgMerchantId?.trim() ?? "";
    const apiKey = globalHyperpgApiKey?.trim() ?? "";

    if (!apiKey || !merchantId) {
      return NextResponse.json(
        { error: "Superadmin HyperPG credentials not configured" },
        { status: 500 }
      );
    }

    const amountNumber = Number(baseAmount.toFixed(2));
    const orderId = generateOrderId();

    const baseUrl =
      process.env.HYPERPG_RETURN_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
    const pathOnly = path.split("?")[0].replace(/\/$/, "") || "/parent?tab=profile";
    const _returnUrl = `${baseUrl.replace(/\/$/, "")}${pathOnly}`;

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
      description: "Parent subscription - Timelly",
      customer_id: customerId,
      order_id: orderId,
      return_url: "http://hyperpg.in/",
      send_mail: false,
      send_sms: false,
      send_whatsapp: false,
    };

    const expiryMins = process.env.HYPERPG_LINK_EXPIRY_MINS;
    if (expiryMins) sessionPayload["metadata.expiryInMins"] = String(expiryMins);

    const apiKeyClean = apiKey.replace(/^["']|["']$/g, "").trim();
    const merchantIdClean = merchantId.replace(/^["']|["']$/g, "").trim();

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
      logger.error("HyperPG subscription session error:", res.status, errText);
      let details = errText.slice(0, 500);
      try {
        const j = JSON.parse(errText) as Record<string, unknown>;
        if (typeof j.error_message === "string") details = j.error_message;
        else if (typeof j.error_code === "string") details = j.error_code;
        else if (typeof j.message === "string") details = j.message;
      } catch {
        // ignore
      }
      return NextResponse.json(
        {
          error: "Payment gateway error",
          details,
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

    await runInTenantScope(student.schoolId, () => prisma.payment.create({
      data: {
        studentId: student.id,
        amount: amountNumber,
        gateway: "HYPERPG",
        hyperpgOrderId: data.id || null,
        status: "PENDING",
        transactionId: orderId,
        purpose: "PARENT_SUBSCRIPTION",
      },
    }));

    return NextResponse.json({
      gateway: "HYPERPG",
      id: data.id || orderId,
      order_id: orderId,
      hyperpg_order_id: data.id || null,
      amount: amountNumber,
      payment_url: paymentUrl,
    });
  } catch (err: unknown) {
    logger.error("Parent subscription order error:", err);
    return NextResponse.json(
      {
        error: "Failed to create subscription order",
        details: toClientErrorMessage(err, "Unknown error"),
      },
      { status: 500 }
    );
  }
}

