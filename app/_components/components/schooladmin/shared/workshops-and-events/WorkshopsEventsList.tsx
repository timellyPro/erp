import TimellyLoader from "../../../common/TimellyLoader";
import EventCard from "../../workshops/EventCard";
import type { EventItem } from "./workshopsAndEventsTypes";

export function WorkshopsEventsList({
  loadingEvents,
  events,
  eventsError,
  pagedEventsWithStatus,
  pageSize,
  clampedPage,
  totalPages,
  setCurrentPage,
  onViewDetails,
  onEdit,
  onDelete,
}: {
  loadingEvents: boolean;
  events: EventItem[];
  eventsError: string | null;
  pagedEventsWithStatus: Array<{ event: EventItem; status: "upcoming" | "completed" }>;
  pageSize: number;
  clampedPage: number;
  totalPages: number;
  setCurrentPage: (updater: (p: number) => number) => void;
  onViewDetails: (eventId: string) => void;
  onEdit: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        {loadingEvents && events.length > 0 && (
          <span className="text-sm text-white/50">Refreshing events...</span>
        )}
      </div>

      {eventsError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {eventsError}
        </div>
      )}

      {loadingEvents && events.length === 0 && !eventsError && (
        <TimellyLoader
          compact
          title="Loading workshops"
          steps={["Events", "Registrations", "Schedules"]}
        />
      )}

      {!loadingEvents && events.length === 0 && !eventsError && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/50">
          No workshops or events yet. Create one above.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {pagedEventsWithStatus.map(({ event, status }) => (
          <EventCard
            key={event.id}
            title={event.title}
            description={event.description}
            eventDate={event.eventDate}
            location={event.location}
            mode={event.mode}
            registrations={event._count?.registrations ?? 0}
            maxSeats={event.maxSeats}
            teacherName={event.teacher?.name ?? ""}
            status={status}
            photo={event.photo}
            additionalInfo={event.additionalInfo}
            onViewDetails={() => onViewDetails(event.id)}
            onEdit={() => onEdit(event)}
            onDelete={() => onDelete(event)}
          />
        ))}
      </div>

      {events.length > pageSize && (
        <div className="flex items-center justify-between pt-3">
          <span className="text-xs text-white/50">
            Page {clampedPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
              className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}
              className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
