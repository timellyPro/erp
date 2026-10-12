export {
  normalizeStudentOption,
  patchDetailShell,
  buildPlaceholderDetail,
  buildPlaceholderById,
  normalizeBreakdownHeadKey,
  patchBreakdownAfterDelete,
  patchBreakdownAfterPayment,
  patchBreakdownAfterDeletePayment,
  buildConfirmedPaymentResult,
  patchDetailAfterPayment,
  isSuccessPaymentStatus,
  computeUpdatedFeeAfterDelete,
  patchDetailAfterDelete,
} from "./studentDetail";

export function dueToPayInputString(due: number): string {
  if (!Number.isFinite(due) || due <= 0) return "";
  return String(Math.round(due * 100) / 100);
}

/** Plain text amount field: digits and one decimal, max 2 fractional digits */
export function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot).replace(/\D/g, "");
  const frac = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`;
}
