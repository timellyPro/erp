import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const ResetCredentialsResponseSchema = z.object({
  message: z.string().optional(),
});
export type ResetCredentialsResponse = z.infer<typeof ResetCredentialsResponseSchema>;

export async function resetStudentCredentials(filterBody: Record<string, unknown>) {
  const result = await apiPost<ResetCredentialsResponse>("/api/student/credentials/reset", filterBody);
  return {
    ...result,
    data: validateApiResponse(ResetCredentialsResponseSchema, result.data, "resetStudentCredentials"),
  };
}
