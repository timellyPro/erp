import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const CreateOrderResponseSchema = z
  .object({
    gateway: z.string().optional(),
    payment_url: z.string().optional(),
    order_id: z.string().optional(),
    id: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    details: z.string().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    statusFromGateway: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

export type FeeSelection = Array<
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName?: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string }
>;

export type VerifyPaymentResponse = {
  message?: string;
};

export function verifyHyperpgPayment(payload: { gateway: "HYPERPG"; order_id: string; amount: number }) {
  return apiPost<VerifyPaymentResponse>("/api/payment/verify", payload);
}

export async function createPaymentOrder(
  endpoint: string,
  payload: {
    amount: number;
    return_path?: string;
    event_registration_id?: string;
    fee_selection?: FeeSelection;
  }
) {
  const result = await apiPost<CreateOrderResponse>(endpoint, payload);
  return {
    ...result,
    data: validateApiResponse(CreateOrderResponseSchema, result.data, "createPaymentOrder"),
  };
}
