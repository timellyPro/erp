import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const EventDetailsResponseSchema = z
  .object({
    message: z.string().optional(),
    event: z.unknown().optional(),
  })
  .passthrough();
export type EventDetailsResponse = z.infer<typeof EventDetailsResponseSchema>;

export async function fetchEventDetails(eventId: string, signal?: AbortSignal) {
  const result = await apiGet<EventDetailsResponse>(`/api/events/create/${eventId}`, { signal });
  return {
    ...result,
    data: validateApiResponse(EventDetailsResponseSchema, result.data, "fetchEventDetails"),
  };
}
