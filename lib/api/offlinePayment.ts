import { z } from "zod";
import { apiGet, apiPost, validateApiResponse } from "./http";

export type SelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export const RecordOfflinePaymentResponseSchema = z
  .object({
    message: z.string().optional(),
    idempotent: z.boolean().optional(),
  })
  .passthrough(); // buildConfirmedPaymentResult reads several more server-assigned fields
export type RecordOfflinePaymentResponse = z.infer<typeof RecordOfflinePaymentResponseSchema>;

export const FeeBreakdownResponseSchema = z.object({
  message: z.string().optional(),
  remainingFee: z.number().optional(),
  dueHeads: z
    .array(
      z.object({
        key: z.string(),
        headType: z.enum(["BASE_COMPONENT", "EXTRA_FEE"]),
        label: z.string(),
        dueBefore: z.number(),
      })
    )
    .optional(),
});
export type FeeBreakdownResponse = z.infer<typeof FeeBreakdownResponseSchema>;

export type RecordOfflinePaymentPayload = {
  studentId: string;
  amount: number;
  paymentMode: string;
  refNo?: string;
  transactionId?: string;
  paymentDate?: string;
  selectedHeads: SelectedHead[];
  explicitAllocations?: Array<{ key: string; amount: number; label: string }>;
  /** Per-submit-attempt key so a double-click or retried request collapses into one Payment. */
  clientRequestId?: string;
};

export async function recordOfflinePayment(payload: RecordOfflinePaymentPayload) {
  const result = await apiPost<RecordOfflinePaymentResponse>("/api/fees/offline-payment", payload);
  return {
    ...result,
    data: validateApiResponse(RecordOfflinePaymentResponseSchema, result.data, "recordOfflinePayment"),
  };
}

export async function fetchFeeBreakdown(studentId: string) {
  const result = await apiGet<FeeBreakdownResponse>(
    `/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`
  );
  return {
    ...result,
    data: validateApiResponse(FeeBreakdownResponseSchema, result.data, "fetchFeeBreakdown"),
  };
}
