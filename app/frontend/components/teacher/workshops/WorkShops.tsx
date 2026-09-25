"use client";

import HeaderActionButton from "../../common/HeaderActionButton";
import PageHeader from "../../common/PageHeader";
import SearchInput from "../../common/SearchInput";
import TimellyLoader from "../../common/TimellyLoader";
import CreateEventForm from "../../schooladmin/workshops/CreateEventForm";
import EventCard from "../../schooladmin/workshops/EventCard";
import EventDetailsModal from "../../schooladmin/workshops/EventDetailsModal";
import DeleteEventModal from "../../schooladmin/workshops/DeleteEventModal";
import {
  loadEventsPage,
  peekEventsPage,
  setEventsPageCache,
  type EventItem,
} from "@/lib/loadSchoolAdminFastTabs";
import { CalendarDays, CheckCircle, List, LucideIcon, Plus, Search, Users, X } from "lucide-react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function TeacherWorkshopsTab() {
  const initial = peekEventsPage();
  const [activeAction, setActiveAction] = useState<"workshop" | "none">("none");
  const [events, setEvents] = useState<EventItem[]>(() => initial ?? []);
  const [loadingEvents, setLoadingEvents] = useState(() => !initial);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<EventItem | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 3;

  const applyEvents = useCallback((list: EventItem[]) => {
    setEvents(list);
    setEventsPageCache(list);
  }, []);

  const fetchEvents = useCallback(
    async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekEventsPage();
        if (cached) {
          setEvents(cached);
          setLoadingEvents(false);
          void fetchEvents(true);
          return;
        }
      }

      try {
        setEventsError(null);
        setLoadingEvents((prev) => (events.length === 0 ? true : prev));
        const list = await loadEventsPage({ revalidate: true });
        applyEvents(list);
      } catch (err: unknown) {
        setEventsError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoadingEvents(false);
      }
    },
    [applyEvents, events.length]
  );

  useEffect(() => {
    void fetchEvents(false);
  }, [fetchEvents]);

  useEffect(() => {
    setCurrentPage(1);
  }, [events.length, search]);

  useEffect(() => {
    if (activeAction !== "workshop") return;
    const timer = setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(timer);
  }, [activeAction]);

  useEffect(() => {
    if (!detailsOpen || !selectedEventId) return;

    const controller = new AbortController();
    const fetchDetails = async () => {
      try {
        setDetailsLoading(true);
        setDetailsError(null);
        const res = await fetch(`/api/events/create/${selectedEventId}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || "Failed to load event details");
        }
        setEventDetails(data?.event ?? null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setDetailsError(err instanceof Error ? err.message : "Failed to load event details");
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
    return () => controller.abort();
  }, [detailsOpen, selectedEventId]);

  const handleCreated = useCallback(
    (event?: EventItem | { id: string } | null) => {
      if (event && "title" in event && event.title) {
        const full = event as EventItem;
        setEvents((prev) => {
          const exists = prev.some((e) => e.id === full.id);
          const next = exists
            ? prev.map((e) => (e.id === full.id ? { ...e, ...full } : e))
            : [full, ...prev];
          setEventsPageCache(next);
          return next;
        });
      }
      void loadEventsPage({ revalidate: true })
        .then((list) => applyEvents(list))
        .catch(() => {});
    },
    [applyEvents]
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const upcoming = events.filter((event) => {
      if (!event.eventDate) return false;
      const time = new Date(event.eventDate).getTime();
      return !Number.isNaN(time) && time >= now;
    }).length;
    const completed = events.filter((event) => {
      if (!event.eventDate) return false;
      const time = new Date(event.eventDate).getTime();
      return !Number.isNaN(time) && time < now;
    }).length;
    const participants = events.reduce(
      (sum, event) => sum + (event._count?.registrations ?? 0),
      0
    );

    return {
      total: events.length,
      upcoming,
      completed,
      participants,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => {
      const title = event.title?.toLowerCase() ?? "";
      const desc = event.description?.toLowerCase() ?? "";
      const location = event.location?.toLowerCase() ?? "";
      const mode = event.mode?.toLowerCase() ?? "";
      return (
        title.includes(q) ||
        desc.includes(q) ||
        location.includes(q) ||
        mode.includes(q)
      );
    });
  }, [events, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pagedEvents = filteredEvents.slice(
    (clampedPage - 1) * pageSize,
    clampedPage * pageSize
  );

  const StatTile = ({
    title,
    value,
    icon,
  }: {
    title: string;
    value: string;
    icon: ReactNode;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:px-5 md:py-4 shadow-lg backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-white/10 flex items-center justify-center text-lime-400">
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">
            {title}
          </div>
          <div className="text-xl sm:text-2xl font-semibold text-white">{value}</div>
        </div>
      </div>
    </div>
  );

  const renderButton = (
    type: "workshop",
    Icon: LucideIcon,
    label: string,
    onClick: () => void,
    primary?: boolean
  ) => {
    const isActive = type === "workshop" && activeAction === "workshop";

    const effectiveLabel = isActive ? "Cancel" : label;
    const EffectiveIcon = isActive ? X : Icon;
    const effectivePrimary = isActive ? false : primary;
    const effectiveOnClick = isActive ? () => setActiveAction("none") : onClick;

    const cancelButton = (
      <button
        onClick={effectiveOnClick}
        className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-black shadow-[0_6px_18px_rgba(163,230,53,0.35)] hover:bg-lime-300 transition cursor-pointer"
      >
        <X size={16} />
        <span>Cancel</span>
      </button>
    );

    return (
      <>
        {/* MOBILE */}
        <div className="xl:hidden w-full">
          {isActive ? (
            <div className="w-full">{cancelButton}</div>
          ) : (
            <button
              onClick={effectiveOnClick}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-black shadow-[0_6px_18px_rgba(163,230,53,0.35)] hover:bg-lime-300 transition cursor-pointer"
            >
              <Icon size={16} />
              <span>{effectiveLabel}</span>
            </button>
          )}
        </div>

        {/* DESKTOP */}
        <div className="hidden xl:block">
          {isActive ? (
            cancelButton
          ) : (
            <HeaderActionButton
              icon={EffectiveIcon}
              label={effectiveLabel}
              primary={effectivePrimary}
              onClick={effectiveOnClick}
            />
          )}
        </div>
      </>
    );
  };

  return (
    <div className="pb-24 lg:pb-6 text-gray-200">
      <div className="w-full space-y-6">
        <PageHeader
          title="Workshops & Events"
          subtitle="Plan, manage, and issue certificates for workshops and events"
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-5 md:p-6 border border-white/10 shadow-lg flex flex-col xl:flex-row xl:items-center justify-between gap-4"
          rightSlot={
            <div className="w-full xl:w-auto">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 xl:justify-end w-full">
                <div className="w-full sm:w-[260px]">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    icon={Search}
                    placeholder="Search..."
                    variant="glass"
                    iconPosition="left"
                  />
                </div>
                {renderButton(
                  "workshop",
                  Plus,
                  "Create Event",
                  () => {
                    setEditingEvent(null);
                    setActiveAction("workshop");
                  },
                  true
                )}
              </div>
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile title="TOTAL" value={`${stats.total}`} icon={<List size={24} />} />
          <StatTile title="UPCOMING" value={`${stats.upcoming}`} icon={<CalendarDays size={24} />} />
          <StatTile title="PARTICIPANTS" value={`${stats.participants}`} icon={<Users size={24} />} />
          <StatTile title="COMPLETED" value={`${stats.completed}`} icon={<CheckCircle size={24} />} />
        </div>


        {activeAction === "workshop" && (
          <div ref={formRef}>
            <CreateEventForm
              onCancel={() => {
                setActiveAction("none");
                setEditingEvent(null);
              }}
              onCreated={handleCreated}
              initialEvent={editingEvent}
            />
          </div>
        )}

        <EventDetailsModal
          open={detailsOpen}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedEventId(null);
            setEventDetails(null);
            setDetailsError(null);
          }}
          loading={detailsLoading}
          error={detailsError}
          event={eventDetails}
        />

        <DeleteEventModal
          open={Boolean(deleteTarget)}
          title={deleteTarget?.title}
          loading={deleteLoading}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!deleteTarget) return;
            const prev = events;
            const next = events.filter((e) => e.id !== deleteTarget.id);
            applyEvents(next);
            setDeleteTarget(null);
            try {
              setDeleteLoading(true);
              const res = await fetch(`/api/events/${deleteTarget.id}`, {
                method: "DELETE",
              });
              const data = await res.json();
              if (!res.ok) {
                applyEvents(prev);
                throw new Error(data?.message || "Failed to delete event");
              }
              void loadEventsPage({ revalidate: true })
                .then((list) => applyEvents(list))
                .catch(() => {});
            } catch (err) {
              console.error(err);
            } finally {
              setDeleteLoading(false);
            }
          }}
        />

        <section className="space-y-4">
          {loadingEvents && events.length === 0 && (
            <TimellyLoader
              compact
              title="Loading events"
              steps={["Workshops", "Registrations", "Schedule"]}
            />
          )}

          {eventsError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {eventsError}
            </div>
          )}

          {!loadingEvents && filteredEvents.length === 0 && !eventsError && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/50">
              No workshops or events found. Create one above.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pagedEvents.map((event) => {
              const dateValue = event.eventDate ? new Date(event.eventDate) : null;
              const status = dateValue && !Number.isNaN(dateValue.getTime())
                ? dateValue.getTime() >= Date.now()
                  ? "upcoming"
                  : "completed"
                : "upcoming";

              return (
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
                  onViewDetails={() => {
                    setSelectedEventId(event.id);
                    setDetailsOpen(true);
                  }}
                  onEdit={() => {
                    setEditingEvent(event);
                    setActiveAction("workshop");
                  }}
                  onDelete={() => setDeleteTarget(event)}
                />
              );
            })}
          </div>

          {filteredEvents.length > pageSize && (
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
      </div>
    </div>
  );
}
