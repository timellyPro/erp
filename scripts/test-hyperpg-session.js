/**
 * Test HyperPG session from command line (same request as Postman).
 * Run from project root: node scripts/test-hyperpg-session.js
 * Uses HYPERPG_API_KEY and HYPERPG_BASE_URL from env (or .env if you use dotenv).
 */
const apiKey = process.env.HYPERPG_API_KEY || "";
const merchantId = (process.env.HYPERPG_MERCHANT_ID || "").trim();
const baseUrl = (process.env.HYPERPG_BASE_URL || "https://sandbox.hyperpg.in").replace(/\/$/, "");
const paymentPageClientId =
  (process.env.HYPERPG_CLIENT_ID || "").trim() || merchantId || "test";
// Same as server api_key mode: Basic base64("API_KEY:")
const auth = Buffer.from(`${apiKey}:`, "utf8").toString("base64");

const body = {
  mobile_country_code: "+91",
  payment_page_client_id: paymentPageClientId,
  amount: "100.00",
  currency: "INR",
  action: "paymentPage",
  customer_email: "test@example.com",
  customer_phone: "8888899999",
  first_name: "John",
  last_name: "Doe",
  description: "Test payment",
  customer_id: "test-customer",
  order_id: "test-order-" + Date.now(),
  return_url: "https://hyperpg.in/",
  send_mail: false,
  send_sms: false,
  send_whatsapp: false,
};

async function main() {
  if (!apiKey) {
    console.error("Set HYPERPG_API_KEY (and HYPERPG_MERCHANT_ID for x-merchantid) in the environment.");
    process.exit(1);
  }
  console.log("POST", baseUrl + "/session");
  console.log("x-merchantid:", merchantId || "(missing — Session API usually needs this)");
  console.log("payment_page_client_id:", paymentPageClientId);
  const res = await fetch(baseUrl + "/session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Basic " + auth,
      "User-Agent": "Timelly-ERP/1.0 (HyperPG session test)",
      ...(merchantId ? { "x-merchantid": merchantId } : {}),
      "x-routing-id": String(body.customer_id).slice(0, 128),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text.slice(0, 500));
  if (res.ok) {
    const j = JSON.parse(text);
    if (j.payment_links?.web) console.log("Payment URL:", j.payment_links.web);
  }
}

main().catch((e) => console.error(e));
