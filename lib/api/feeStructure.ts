import { z } from "zod";
import { apiDelete, apiPut, apiRequest, validateApiResponse } from "./http";

export const BulkUploadResponseSchema = z.object({
  updatedClasses: z.number().optional(),
  updated: z.array(z.object({ label: z.string(), components: z.number() })).optional(),
  failed: z.array(z.object({ row: z.number(), message: z.string() })).optional(),
  message: z.string().optional(),
});
export type BulkUploadResponse = z.infer<typeof BulkUploadResponseSchema>;

export const SaveFeeStructureResponseSchema = z.object({
  message: z.string().optional(),
});
export type SaveFeeStructureResponse = z.infer<typeof SaveFeeStructureResponseSchema>;

export async function uploadFeeStructureBulk(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  // Multipart body — no Content-Type header, the browser sets the boundary.
  const result = await apiRequest<BulkUploadResponse>("/api/fees/structure/bulk", {
    method: "POST",
    body: fd,
  });
  return {
    ...result,
    data: validateApiResponse(BulkUploadResponseSchema, result.data, "uploadFeeStructureBulk"),
  };
}

export async function saveFeeStructure(classId: string, components: Array<{ name: string; amount: number }>) {
  const result = await apiPut<SaveFeeStructureResponse>("/api/fees/structure", { classId, components });
  return {
    ...result,
    data: validateApiResponse(SaveFeeStructureResponseSchema, result.data, "saveFeeStructure"),
  };
}

export async function deleteFeeStructure(classId: string) {
  const result = await apiDelete<SaveFeeStructureResponse>(
    `/api/fees/structure?classId=${encodeURIComponent(classId)}`
  );
  return {
    ...result,
    data: validateApiResponse(SaveFeeStructureResponseSchema, result.data, "deleteFeeStructure"),
  };
}
