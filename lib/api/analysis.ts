import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const FeeTransactionsResponseSchema = z.object({
  message: z.string().optional(),
  transactions: z
    .array(
      z.object({
        amount: z.number(),
        createdAt: z.string(),
        transactionId: z.string().nullable().optional(),
        feeAllocations: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
        student: z.object({
          id: z.string(),
          admissionNumber: z.string().nullable().optional(),
          user: z.object({ name: z.string().nullable().optional() }).optional(),
          class: z
            .object({ name: z.string().nullable().optional(), section: z.string().nullable().optional() })
            .nullable()
            .optional(),
        }),
      })
    )
    .optional(),
});
export type FeeTransactionsResponse = z.infer<typeof FeeTransactionsResponseSchema>;

export const FeeSummaryResponseSchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough(); // consumer reads a handful of summary fields loosely by name
export type FeeSummaryResponse = z.infer<typeof FeeSummaryResponseSchema>;

export async function fetchFeeTransactionsForExport() {
  const result = await apiGet<FeeTransactionsResponse>("/api/fees/transactions?limit=200", {
    cache: "no-store",
  });
  return {
    ...result,
    data: validateApiResponse(FeeTransactionsResponseSchema, result.data, "fetchFeeTransactionsForExport"),
  };
}

export async function fetchFeeSummaryForExport() {
  const result = await apiGet<FeeSummaryResponse>("/api/fees/summary", { cache: "no-store" });
  return {
    ...result,
    data: validateApiResponse(FeeSummaryResponseSchema, result.data, "fetchFeeSummaryForExport"),
  };
}
