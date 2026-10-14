import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const RefundPaymentResponseSchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();
export type RefundPaymentResponse = z.infer<typeof RefundPaymentResponseSchema>;

export async function refundPayment(payload: { paymentId: string; amount: number; reason?: string }) {
  const result = await apiPost<RefundPaymentResponse>("/api/payment/refund", payload);
  return {
    ...result,
    data: validateApiResponse(RefundPaymentResponseSchema, result.data, "refundPayment"),
  };
}
