import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const SubscriptionStatusResponseSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED"]).optional(),
  isTrial: z.boolean().optional(),
  billingMode: z.string().optional(),
  amount: z.number().optional(),
  remainingDays: z.number().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  trialDays: z.number().optional(),
  deactivated: z.boolean().optional(),
  message: z.string().optional(),
});
export type SubscriptionStatusResponse = z.infer<typeof SubscriptionStatusResponseSchema>;

export const SubscriptionHistoryResponseSchema = z.object({
  message: z.string().optional(),
  payments: z
    .array(
      z.object({
        id: z.string(),
        amount: z.number(),
        createdAt: z.string(),
        transactionId: z.string().nullable(),
      })
    )
    .optional(),
});
export type SubscriptionHistoryResponse = z.infer<typeof SubscriptionHistoryResponseSchema>;

export async function fetchParentSubscriptionStatus() {
  const result = await apiGet<SubscriptionStatusResponse>("/api/parent/subscription/status");
  return {
    ...result,
    data: validateApiResponse(
      SubscriptionStatusResponseSchema,
      result.data,
      "fetchParentSubscriptionStatus"
    ),
  };
}

export async function fetchParentSubscriptionHistory() {
  const result = await apiGet<SubscriptionHistoryResponse>("/api/parent/subscription/history");
  return {
    ...result,
    data: validateApiResponse(
      SubscriptionHistoryResponseSchema,
      result.data,
      "fetchParentSubscriptionHistory"
    ),
  };
}
