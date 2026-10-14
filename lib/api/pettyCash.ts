import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, validateApiResponse } from "./http";
import type { PettyCashExpense } from "@/app/_components/components/schooladmin/fees/shared/petty-cash/pettyCashTypes";

// Mirrors PettyCashExpense in pettyCashTypes.ts (the component owns that
// type; this just validates the network response matches it at runtime).
const PettyCashExpenseSchema = z.object({
  id: z.string(),
  voucherNo: z.number(),
  itemName: z.string(),
  headOfAccount: z.string().nullable().optional(),
  paymentType: z.string().nullable().optional(),
  amount: z.number(),
  expenseDate: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<PettyCashExpense>;

export const PettyCashListResponseSchema = z.object({
  message: z.string().optional(),
  expenses: z.array(PettyCashExpenseSchema).optional(),
});
export type PettyCashListResponse = z.infer<typeof PettyCashListResponseSchema>;

export type PettyCashSaveResponse = {
  message?: string;
};

export async function fetchPettyCashExpenses() {
  const result = await apiGet<PettyCashListResponse>("/api/fees/petty-cash", { cache: "no-store" });
  return {
    ...result,
    data: validateApiResponse(PettyCashListResponseSchema, result.data, "fetchPettyCashExpenses"),
  };
}

export type PettyCashSavePayload = {
  itemName: string;
  headOfAccount: string;
  paymentType: string;
  amount: number;
  expenseDate: string;
  description: string;
};

export function createPettyCashExpense(payload: PettyCashSavePayload) {
  return apiPost<PettyCashSaveResponse>("/api/fees/petty-cash", payload);
}

export function updatePettyCashExpense(id: string, payload: PettyCashSavePayload) {
  return apiPatch<PettyCashSaveResponse>(`/api/fees/petty-cash/${id}`, payload);
}

export function deletePettyCashExpense(id: string) {
  return apiDelete<PettyCashSaveResponse>(`/api/fees/petty-cash/${id}`);
}
