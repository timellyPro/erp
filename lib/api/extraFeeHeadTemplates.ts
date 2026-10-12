import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, validateApiResponse } from "./http";

const TemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  amount: z.number().optional(),
  splitIntoTwoInstallments: z.boolean().optional(),
});

export const ExtraFeeHeadTemplatesResponseSchema = z.object({
  message: z.string().optional(),
  templates: z.array(TemplateSchema).optional(),
});
export type ExtraFeeHeadTemplatesResponse = z.infer<typeof ExtraFeeHeadTemplatesResponseSchema>;

export type ExtraFeeHeadTemplateSaveResponse = {
  message?: string;
};

export async function fetchExtraFeeHeadTemplates() {
  const result = await apiGet<ExtraFeeHeadTemplatesResponse>("/api/fees/extra-head-templates", {
    cache: "no-store",
  });
  return {
    ...result,
    data: validateApiResponse(ExtraFeeHeadTemplatesResponseSchema, result.data, "fetchExtraFeeHeadTemplates"),
  };
}

export type ExtraFeeHeadTemplatePayload = {
  name: string;
  amount: number;
  splitIntoTwoInstallments: boolean;
};

export function createExtraFeeHeadTemplate(payload: ExtraFeeHeadTemplatePayload) {
  return apiPost<ExtraFeeHeadTemplateSaveResponse>("/api/fees/extra-head-templates", payload);
}

export function updateExtraFeeHeadTemplate(id: string, payload: ExtraFeeHeadTemplatePayload) {
  return apiPatch<ExtraFeeHeadTemplateSaveResponse>(
    `/api/fees/extra-head-templates/${encodeURIComponent(id)}`,
    payload
  );
}

export function deleteExtraFeeHeadTemplate(id: string) {
  return apiDelete<ExtraFeeHeadTemplateSaveResponse>(
    `/api/fees/extra-head-templates/${encodeURIComponent(id)}`
  );
}
