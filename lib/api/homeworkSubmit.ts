import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const HomeworkSubmitResponseSchema = z
  .object({
    message: z.string().optional(),
    submission: z
      .object({
        id: z.string(),
        fileUrl: z.string().nullable(),
        submittedAt: z.string(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();
export type HomeworkSubmitResponse = z.infer<typeof HomeworkSubmitResponseSchema>;

export async function submitHomework(homeworkId: string, fileUrl: string) {
  const result = await apiPost<HomeworkSubmitResponse>("/api/homework/submit", { homeworkId, fileUrl });
  return {
    ...result,
    data: validateApiResponse(HomeworkSubmitResponseSchema, result.data, "submitHomework"),
  };
}
