/**
 * Canonical payment gateway strings stored on Payment.gateway
 * and interpreted by fee reports / exports.
 */

export type FeeReportColumn = "Cash" | "OTHERS" | "ONLINE PAYMENT" | "Cheque" | "DD";

/** Maps free-text or legacy values to a stable DB gateway code (OFFLINE_* or HYPERPG). */
export function canonicalizeGatewayForStorage(raw: string): string {
  const u = String(raw || "").trim().toUpperCase();
  if (!u) return "OFFLINE_CASH";
  if (u === "HYPERPG") return "HYPERPG";
  if (u.startsWith("OFFLINE_")) return u;
  if (u === "OFFLINE") return "OFFLINE_CASH";
  if (u === "CASH") return "OFFLINE_CASH";
  if (u === "ONLINE") return "OFFLINE_ONLINE";
  if (u === "UPI") return "OFFLINE_UPI";
  if (u === "CHEQUE" || u === "CHQ") return "OFFLINE_CHEQUE";
  if (u === "DD") return "OFFLINE_DD";
  if (
    u === "BANK_TRANSFER" ||
    u === "BANK" ||
    u === "CARD" ||
    u === "NEFT" ||
    u === "RTGS" ||
    u === "IMPS"
  ) {
    return "OFFLINE_BANK_TRANSFER";
  }
  if (u === "OTHERS") return "OFFLINE_OTHERS";
  return u;
}

/** Column in the school fee Excel matrix (Cash / Online / …). */
export function feeReportColumnFromGateway(gateway?: string | null): FeeReportColumn {
  const g = String(gateway || "").trim().toUpperCase();
  const normalized = g.startsWith("OFFLINE_") ? g.slice("OFFLINE_".length) : g;
  if (normalized === "CASH" || normalized === "OFFLINE") return "Cash";
  if (normalized === "CHEQUE") return "Cheque";
  if (normalized === "DD") return "DD";
  if (
    normalized === "HYPERPG" ||
    normalized === "ONLINE" ||
    normalized === "UPI" ||
    normalized === "BANK_TRANSFER" ||
    normalized === "BANK" ||
    normalized === "CARD" ||
    normalized === "NEFT" ||
    normalized === "RTGS" ||
    normalized === "IMPS"
  ) {
    return "ONLINE PAYMENT";
  }
  return "OTHERS";
}

export function paymentTypeExportLabel(gateway?: string | null): string {
  const m = String(gateway || "").trim().toUpperCase();
  if (!m) return "-";
  if (m === "OFFLINE" || m === "CASH" || m === "OFFLINE_CASH") return "Cash";
  if (m === "HYPERPG") return "Online (payment gateway)";
  if (m === "UPI" || m === "OFFLINE_UPI") return "UPI";
  if (m === "CHEQUE" || m === "OFFLINE_CHEQUE") return "Cheque";
  if (m === "DD" || m === "OFFLINE_DD") return "Demand Draft (DD)";
  if (m === "ONLINE" || m === "OFFLINE_ONLINE") return "Online (UPI / QR / net banking)";
  if (
    m === "BANK_TRANSFER" ||
    m === "OFFLINE_BANK_TRANSFER" ||
    m === "BANK" ||
    m === "OFFLINE_BANK" ||
    m === "CARD" ||
    m === "OFFLINE_CARD" ||
    m === "NEFT" ||
    m === "RTGS" ||
    m === "IMPS"
  ) {
    return "Bank / card / transfer";
  }
  if (m === "OFFLINE_OTHERS" || m === "OTHERS") return "Others";
  if (m.startsWith("OFFLINE_")) {
    return m
      .slice("OFFLINE_".length)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(gateway || "").trim() || "-";
}
