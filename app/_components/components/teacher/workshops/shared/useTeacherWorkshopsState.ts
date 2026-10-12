import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadEventsPage,
  peekEventsPage,
  setEventsPageCache,
  type EventItem,
} from "@/lib/school/loadSchoolAdminFastTabs";

export function useTeacherWorkshopsState() {
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

  const pagedEventsWithStatus = useMemo(
    () =>
      pagedEvents.map((event) => {
        const dateValue = event.eventDate ? new Date(event.eventDate) : null;
        const status: "upcoming" | "completed" =
          dateValue && !Number.isNaN(dateValue.getTime()) && dateValue.getTime() < Date.now()
            ? "completed"
            : "upcoming";
        return { event, status };
      }),
    [pagedEvents]
  );

  const handleDeleteConfirm = async () => {
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
  };

  return {
    activeAction,
    setActiveAction,
    events,
    loadingEvents,
    eventsError,
    detailsOpen,
    setDetailsOpen,
    selectedEventId,
    setSelectedEventId,
    detailsLoading,
    detailsError,
    eventDetails,
    setEventDetails,
    setDetailsError,
    editingEvent,
    setEditingEvent,
    deleteTarget,
    setDeleteTarget,
    deleteLoading,
    search,
    setSearch,
    formRef,
    currentPage,
    setCurrentPage,
    pageSize,
    handleCreated,
    stats,
    filteredEvents,
    totalPages,
    clampedPage,
    pagedEvents,
    pagedEventsWithStatus,
    handleDeleteConfirm,
  };
}
