import { z } from "zod";
import { apiDelete, apiGet, apiPost, validateApiResponse } from "./http";

export const DeleteEventResponseSchema = z.object({
  message: z.string().optional(),
});
export type DeleteEventResponse = z.infer<typeof DeleteEventResponseSchema>;

export async function deleteEvent(id: string) {
  const result = await apiDelete<DeleteEventResponse>(`/api/events/${id}`);
  return {
    ...result,
    data: validateApiResponse(DeleteEventResponseSchema, result.data, "deleteEvent"),
  };
}

export type EventRegistrationsResponse = {
  students?: Array<{
    id: string;
    registrationId: string;
    name: string | null;
    email: string | null;
    class: string | null;
    paymentStatus: string;
  }>;
};

export function fetchEventRegistrations(eventId: string) {
  return apiGet<EventRegistrationsResponse>(`/api/events/${eventId}/registrations`);
}

export type EventRegisterResponse = {
  message?: string;
};

export function registerForEvent(eventId: string) {
  return apiPost<EventRegisterResponse>("/api/events/register", { eventId });
}
