import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

// ChairmanSummary is a local, unexported type in ChairmanDashboard.tsx with
// several nested aggregate fields; the schema checks the top-level envelope
// rather than re-mirroring every nested field.
export const ChairmanDashboardResponseSchema = z
  .object({
    message: z.string().optional(),
    summary: z.unknown().optional(),
  })
  .passthrough();
export type ChairmanDashboardResponse = z.infer<typeof ChairmanDashboardResponseSchema>;

export async function fetchChairmanDashboard(date: string) {
  const params = new URLSearchParams({ date });
  const result = await apiGet<ChairmanDashboardResponse>(`/api/chairman/dashboard?${params.toString()}`, {
    cache: "no-store",
  });
  return {
    ...result,
    data: validateApiResponse(ChairmanDashboardResponseSchema, result.data, "fetchChairmanDashboard"),
  };
}
