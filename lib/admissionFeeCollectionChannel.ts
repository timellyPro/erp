export type AdmissionFeeCollectionChannel = "cash" | "online";

/** Classify paid admission fee as cash (offline) or online for collection reports. */
export function admissionFeeCollectionChannel(
  paymentMode: string | null | undefined,
  paymentMethod: string | null | undefined
): AdmissionFeeCollectionChannel {
  const mode = String(paymentMode ?? "")
    .trim()
    .toUpperCase();
  const methodBase = String(paymentMethod ?? "")
    .trim()
    .toUpperCase()
    .split("|")[0]
    ?.trim() ?? "";

  const digitalMethods = new Set(["UPI", "BANK_TRANSFER", "CARD"]);

  if (mode === "ONLINE") return "online";
  if (mode === "OFFLINE") {
    if (digitalMethods.has(methodBase)) return "online";
    return "cash";
  }

  if (digitalMethods.has(methodBase)) return "online";
  return "cash";
}

export type ChannelTotals = { count: number; amount: number };

export function admissionFeeTotalsByChannel(
  rows: ReadonlyArray<{
    admissionFee: number;
    paymentMode: string | null;
    paymentMethod: string | null;
  }>
): Partial<Record<AdmissionFeeCollectionChannel, ChannelTotals>> {
  const acc: Record<AdmissionFeeCollectionChannel, ChannelTotals> = {
    cash: { count: 0, amount: 0 },
    online: { count: 0, amount: 0 },
  };

  for (const r of rows) {
    const ch = admissionFeeCollectionChannel(r.paymentMode, r.paymentMethod);
    acc[ch].count += 1;
    acc[ch].amount += Number(r.admissionFee) || 0;
  }

  const out: Partial<Record<AdmissionFeeCollectionChannel, ChannelTotals>> = {};
  if (acc.cash.count > 0) {
    out.cash = {
      count: acc.cash.count,
      amount: Math.round(acc.cash.amount * 100) / 100,
    };
  }
  if (acc.online.count > 0) {
    out.online = {
      count: acc.online.count,
      amount: Math.round(acc.online.amount * 100) / 100,
    };
  }
  return out;
}
