import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const BulkExtraFeeByTimellyResponseSchema = z.object({
  message: z.string().optional(),
  created: z.number().optional(),
  failed: z.number().optional(),
  errors: z
    .array(z.object({ index: z.number(), timellyId: z.string(), message: z.string() }))
    .optional(),
  cleanedDuplicates: z.number().optional(),
});
export type BulkExtraFeeByTimellyResponse = z.infer<typeof BulkExtraFeeByTimellyResponseSchema>;

export async function importBulkExtraFeeByTimelly(rows: unknown[]) {
  const result = await apiPost<BulkExtraFeeByTimellyResponse>("/api/fees/extra/bulk-by-timelly", { rows });
  return {
    ...result,
    data: validateApiResponse(
      BulkExtraFeeByTimellyResponseSchema,
      result.data,
      "importBulkExtraFeeByTimelly"
    ),
  };
}

export async function cleanupBulkExtraFeeDuplicates() {
  const result = await apiPost<BulkExtraFeeByTimellyResponse>("/api/fees/extra/bulk-by-timelly", {
    cleanupDuplicates: true,
  });
  return {
    ...result,
    data: validateApiResponse(
      BulkExtraFeeByTimellyResponseSchema,
      result.data,
      "cleanupBulkExtraFeeDuplicates"
    ),
  };
}
