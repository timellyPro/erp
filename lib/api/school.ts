import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const SchoolMineResponseSchema = z.object({
  school: z
    .object({
      name: z.string().nullable().optional(),
      logoUrl: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      affiliationLine: z.string().nullable().optional(),
      admins: z.array(z.object({ photoUrl: z.string().nullable().optional() })).optional(),
    })
    .optional(),
});
export type SchoolMineResponse = z.infer<typeof SchoolMineResponseSchema>;

export async function fetchMySchool() {
  const result = await apiGet<SchoolMineResponse>("/api/school/mine", { cache: "no-store" });
  return {
    ...result,
    data: validateApiResponse(SchoolMineResponseSchema, result.data, "fetchMySchool"),
  };
}
