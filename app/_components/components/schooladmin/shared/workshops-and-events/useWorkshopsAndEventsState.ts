import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadEventDetails,
  loadEventsPage,
  peekEventDetails,
  peekEventsPage,
  setEventsPageCache,
} from "@/lib/school/loadSchoolAdminFastTabs";
import { getErrorMessage, getErrorName } from "@/lib/errors/errorInfo";
import type { EventItem } from "./workshopsAndEventsTypes";
import { deleteEvent } from "@/lib/api/events";

export function useWorkshopsAndEventsState() {
  const [activeAction, setActiveAction] = useState<"workshop" | "none">("none");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<EventItem | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 3;

  const fetchEvents = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekEventsPage();
      if (cached) {
        setEvents(cached as EventItem[]);
        setLoadingEvents(false);
        void fetchEvents(true);
        return;
      }
    }

    try {
      setLoadingEvents(events.length === 0);
      setEventsError(null);
      const rows = await loadEventsPage({ revalidate });
      setEvents(rows as EventItem[]);
    } catch (err: unknown) {
      setEventsError(getErrorMessage(err) || "Failed to load events");
    } finally {
      setLoadingEvents(false);
    }
  }, [events.length]);

  const refetchEventsAfterMutation = useCallback(() => {
    void fetchEvents(true);
  }, [fetchEvents]);

  const handleEventUpsert = useCallback(
    (event?: { id: string } | null) => {
      if (event?.id) {
        setEvents((prev) => {
          const index = prev.findIndex((e) => e.id === event.id);
          const next =
            index === -1
              ? [event as EventItem, ...prev]
              : prev.map((e) => (e.id === event.id ? { ...e, ...event } : e));
          setEventsPageCache(next);
          return next;
        });
      }
      refetchEventsAfterMutation();
    },
    [refetchEventsAfterMutation]
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setCurrentPage(1);
  }, [events.length]);

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
        const cached = peekEventDetails(selectedEventId);
        if (cached) {
          setEventDetails(cached as EventItem);
          setDetailsLoading(false);
        }
        const data = await loadEventDetails(selectedEventId, {
          revalidate: Boolean(cached),
          signal: controller.signal,
        });
        setEventDetails(data as EventItem);
      } catch (err: unknown) {
        if (getErrorName(err) === "AbortError") return;
        setDetailsError(getErrorMessage(err) || "Failed to load event details");
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
    return () => controller.abort();
  }, [detailsOpen, selectedEventId]);

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

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pagedEvents = events.slice(
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
    const deletingEventId = deleteTarget.id;
    const snapshot = events;
    const nextEvents = events.filter((e) => e.id !== deletingEventId);
    setEvents(nextEvents);
    setEventsPageCache(nextEvents);
    setDeleteTarget(null);
    try {
      setDeleteLoading(true);
      const { ok, data } = await deleteEvent(deletingEventId);
      if (!ok) {
        throw new Error(data?.message || "Failed to delete event");
      }
      void fetchEvents(true);
    } catch (err) {
      setEvents(snapshot);
      setEventsPageCache(snapshot);
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
    formRef,
    currentPage,
    setCurrentPage,
    pageSize,
    handleEventUpsert,
    stats,
    totalPages,
    clampedPage,
    pagedEventsWithStatus,
    handleDeleteConfirm,
    fetchEvents,
  };
}
