export type DueHeadRow = {
  key: string;
  label: string;
  total: number;
  paid: number;
  due: number;
  status: { label: string; className: string };
};

export function formatPaymentMethod(method?: string) {
  const m = String(method || "").trim().toUpperCase();
  if (!m) return "—";
  if (m === "OFFLINE" || m === "CASH" || m === "OFFLINE_CASH") return "Cash";
  if (m === "UPI" || m === "OFFLINE_UPI") return "UPI";
  if (m === "CHEQUE" || m === "OFFLINE_CHEQUE") return "Cheque";
  if (m === "DD" || m === "OFFLINE_DD") return "Demand draft";
  if (m === "ONLINE" || m === "OFFLINE_ONLINE") return "Online";
  if (m === "BANK_TRANSFER" || m === "OFFLINE_BANK_TRANSFER") return "Bank transfer";
  if (m === "CARD" || m === "OFFLINE_CARD") return "Card";
  if (m === "HYPERPG") return "Online gateway";
  if (m === "OFFLINE_OTHERS" || m === "OTHERS") return "Others";
  if (m.startsWith("OFFLINE_")) {
    return m
      .slice("OFFLINE_".length)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return method || "—";
}

export function formatRupee(n: number) {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

export function headStatus(due: number, total: number) {
  if (total <= 0) return { label: "N/A", className: "bg-white/10 text-gray-400" };
  if (due <= 0) return { label: "Paid", className: "bg-emerald-500/20 text-emerald-400" };
  if (due < total) return { label: "Partial", className: "bg-amber-500/20 text-amber-400" };
  return { label: "Due", className: "bg-red-500/20 text-red-400" };
}
