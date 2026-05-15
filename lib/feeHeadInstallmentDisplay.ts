import {
  baseNameFromInstallmentFee,
  canonicalExtraFeeBaseName,
  installmentIndexFromName,
  isInstallmentFeeName,
  stripInstallmentPhrasesFromName,
} from "@/lib/extraFeeInstallments";
import { isHostelCategoryExtraFeeName, isMessCategoryExtraFeeName } from "@/lib/extraFeeResidencyScope";
import { shouldSplitFeeHeadIntoTwoInstallments } from "@/lib/feeHeadInstallmentSplit";

function toDisplayTitle(text: string): string {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "kms" || lower === "km") return lower;
      if (/^\d+$/.test(word)) return word;
      if (word.includes("-") && /^\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function isTransportCategoryName(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  return n.includes("transport");
}

/** "Transportation Fee - 11 to 12 kms" → "Transportation Fee (11 to 12 kms)" */
function formatTransportDisplayBase(cleaned: string): string {
  const stripped = stripInstallmentPhrasesFromName(cleaned);
  const m = stripped.match(/^transportation\s+fee\s*[-–:]?\s*(.*)$/i);
  if (!m) return toDisplayTitle(stripped);
  const route = (m[1] ?? "").trim().replace(/^[-–]+\s*/, "");
  if (!route) return "Transportation Fee";
  return `Transportation Fee (${route.toLowerCase()})`;
}

function resolveInstallmentDisplayBase(raw: string): string {
  let base = stripInstallmentPhrasesFromName(canonicalExtraFeeBaseName(raw));

  if (isHostelCategoryExtraFeeName(raw) && !isMessCategoryExtraFeeName(raw)) {
    return "Hostel Fee";
  }
  if (isMessCategoryExtraFeeName(raw)) {
    return "Mess Fee";
  }
  if (isTransportCategoryName(raw)) {
    return formatTransportDisplayBase(base);
  }
  return toDisplayTitle(base);
}

/** Clean card title, e.g. "Transportation Fee (11 to 12 kms) - 1st Installment". */
export function formatFeeHeadDisplayLabel(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Fee Head";

  const idx = installmentIndexFromName(raw);
  if (!idx) return resolveInstallmentDisplayBase(raw);

  const base = resolveInstallmentDisplayBase(raw);
  if (idx === 1) return `${base} - 1st Installment`;
  return `${base} - 2nd Installment`;
}

export type SplittableFeeHead = {
  key: string;
  label: string;
  amount: number;
  paid: number;
  due: number;
  splitIntoTwoInstallments?: boolean;
  extraFeeId?: string;
};

export type DisplayFeeHead<T extends SplittableFeeHead> = T & {
  sourceKey?: string;
  extraFeeFullAmount?: number;
  extraFeeNameForEdit?: string;
};

/**
 * Legacy UI split for lump rows only. Already-split DB rows keep a single clean label.
 */
export function splitFeeHeadsForDisplay<T extends SplittableFeeHead>(
  heads: T[]
): Array<DisplayFeeHead<T>> {
  const out: Array<DisplayFeeHead<T>> = [];

  for (const h of heads) {
    const displayLabel = formatFeeHeadDisplayLabel(h.label);
    const editBase = stripInstallmentPhrasesFromName(baseNameFromInstallmentFee(h.label));

    if (isInstallmentFeeName(h.label)) {
      out.push({
        ...h,
        label: displayLabel,
        extraFeeNameForEdit: editBase,
        extraFeeFullAmount: h.extraFeeId ? Number(h.amount) : undefined,
      });
      continue;
    }

    if (
      !shouldSplitFeeHeadIntoTwoInstallments(h.label, {
        splitIntoTwoInstallments: h.splitIntoTwoInstallments,
      })
    ) {
      out.push({
        ...h,
        label: displayLabel,
        extraFeeNameForEdit: h.label,
        extraFeeFullAmount: h.extraFeeId ? Number(h.amount) : undefined,
      });
      continue;
    }

    const total = Number(h.amount) || 0;
    const paidTotal = Math.max(Number(h.paid) || 0, 0);
    const firstAmount = Math.round((total / 2) * 100) / 100;
    const secondAmount = Math.round((total - firstAmount) * 100) / 100;

    const firstPaid = Math.min(paidTotal, firstAmount);
    const secondPaid = Math.min(Math.max(paidTotal - firstAmount, 0), secondAmount);
    const firstDue = Math.max(firstAmount - firstPaid, 0);
    const secondDue = Math.max(secondAmount - secondPaid, 0);

    const base = resolveInstallmentDisplayBase(h.label);
    const meta = {
      extraFeeFullAmount: total,
      extraFeeNameForEdit: editBase,
    };

    out.push({
      ...h,
      ...meta,
      key: `${h.key}::INST1`,
      sourceKey: h.key,
      label: `${base} - 1st Installment`,
      amount: firstAmount,
      paid: firstPaid,
      due: firstDue,
    });
    out.push({
      ...h,
      ...meta,
      key: `${h.key}::INST2`,
      sourceKey: h.key,
      label: `${base} - 2nd Installment`,
      amount: secondAmount,
      paid: secondPaid,
      due: secondDue,
    });
  }

  return out;
}
