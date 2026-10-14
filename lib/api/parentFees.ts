import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const ParentFeeResponseSchema = z
  .object({
    message: z.string().optional(),
    fee: z
      .object({
        id: z.string(),
        totalFee: z.number(),
        finalFee: z.number(),
        amountPaid: z.number(),
        remainingFee: z.number(),
        components: z.array(z.object({ name: z.string(), amount: z.number() })),
        extraFees: z.array(z.object({ name: z.string(), amount: z.number() })),
        payments: z.array(
          z.object({
            id: z.string(),
            amount: z.number(),
            createdAt: z.string(),
            transactionId: z.string().optional(),
          })
        ),
      })
      .optional(),
  })
  .passthrough();
export type ParentFeeResponse = z.infer<typeof ParentFeeResponseSchema>;

export async function fetchMyFees() {
  const result = await apiGet<ParentFeeResponse>("/api/fees/mine");
  return {
    ...result,
    data: validateApiResponse(ParentFeeResponseSchema, result.data, "fetchMyFees"),
  };
}
