import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const ChairmanProfileResponseSchema = z.object({
  message: z.string().optional(),
  user: z
    .object({
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      mobile: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      language: z.string().nullable().optional(),
      photoUrl: z.string().nullable().optional(),
    })
    .optional(),
});
export type ChairmanProfileResponse = z.infer<typeof ChairmanProfileResponseSchema>;

export async function fetchChairmanProfile() {
  const result = await apiGet<ChairmanProfileResponse>("/api/chairman/me", { cache: "no-store" });
  return {
    ...result,
    data: validateApiResponse(ChairmanProfileResponseSchema, result.data, "fetchChairmanProfile"),
  };
}
