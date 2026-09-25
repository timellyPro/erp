

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle, List, Search, Users } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import EventCard from "../../schooladmin/workshops/EventCard";
import EventDetailsModal from "../../schooladmin/workshops/EventDetailsModal";
import ParentTimellyLoader from "../ParentTimellyLoader";
import { useSession } from "next-auth/react";
import { fetchParentEventsList, peekParentPortalAny } from "@/lib/loadParentPortal";

/* ================= TYPES ================= */

interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  location?: string | null;
  mode?: string | null;
  additionalInfo?: string | null;
  photo?: string | null;
  maxSeats?: number | null;
  hasCertificate?: boolean;
  teacher?: { name?: string | null; email?: string | null; photoUrl?: string | null } | null;
  _count?: { registrations: number };
}

/* ================= STAT TILE ================= */

function StatTile({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-lime-300">
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-white/60">
            {title}
          </div>
          <div className="text-base sm:text-lg font-semibold text-white truncate">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= MAIN ================= */

export default function ParentWorkshopsTab() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const PAGE_SIZE = 3;
  const verifiedRef = useRef(false);
  const [events, setEvents] = useState<EventItem[]>(() => {
    const peeked = peekParentPortalAny<{ events: EventItem[] }>("events", "all");
    return peeked?.events ?? [];
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<EventItem | null>(null);
  const [page, setPage] = useState(1);

  /* ================= FETCH EVENTS ================= */

  const fetchEvents = useCallback(async () => {
    if (!studentId) {
      setLoadingEvents(false);
      return;
    }
    const hasCache = events.length > 0;
    try {
      if (!hasCache) setLoadingEvents(true);
      setEventsError(null);

      const data = await fetchParentEventsList(studentId);
      setEvents(Array.isArray(data?.events) ? (data.events as EventItem[]) : []);
    } catch (err: unknown) {
      setEventsError(err instanceof Error ? err.message : "Failed to load workshops");
    } finally {
      setLoadingEvents(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Handle HyperPG return: verify workshop payment from cookie
  useEffect(() => {
    if (verifiedRef.current || typeof document === "undefined") return;
    const match = document.cookie.match(/hyperpg_pending=([^;]+)/);
    if (match) {
      try {
        const [orderId, amountStr] = decodeURIComponent(match[1]).split("|");
        const amount = parseFloat(amountStr);
        if (orderId && !Number.isNaN(amount) && amount > 0) {
          verifiedRef.current = true;
          document.cookie = "hyperpg_pending=; path=/; max-age=0";
          fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gateway: "HYPERPG", order_id: orderId, amount }),
          })
            .then(async (res) => {
              const d = await res.json();
              if (!res.ok) alert(d?.message || "Payment verification failed");
              else fetchEvents();
            })
            .catch(console.error);
        }
      } catch (_) {}
    }
  }, [fetchEvents]);

  /* ================= FETCH DETAILS ================= */

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

        if (!res.ok)
          throw new Error(data?.message || "Failed to load event details");

        setEventDetails(data?.event ?? null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setDetailsError(err?.message || "Failed to load event details");
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
    return () => controller.abort();
  }, [detailsOpen, selectedEventId]);

  /* ================= FILTER ================= */

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return events;

    return events.filter((event) =>
      [event.title, event.description, event.teacher?.name, event.location, event.mode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [events, query]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, page]);

  useEffect(() => {
    setPage(1);
  }, [query, events.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  /* ================= STATS ================= */

  const stats = useMemo(() => {
    const now = Date.now();

    const upcoming = events.filter((e) => {
      if (!e.eventDate) return false;
      const t = new Date(e.eventDate).getTime();
      return !Number.isNaN(t) && t >= now;
    }).length;

    const completed = events.filter((e) => {
      if (!e.eventDate) return false;
      const t = new Date(e.eventDate).getTime();
      return !Number.isNaN(t) && t < now;
    }).length;

    const participants = events.reduce(
      (sum, e) => sum + (e._count?.registrations ?? 0),
      0
    );

    return { total: events.length, upcoming, completed, participants };
  }, [events]);

  /* ================= UI ================= */

  return (
    <div className="w-full overflow-x-hidden">
      {/* ✅ LEFT-ALIGNED DASHBOARD CONTAINER */}
      <div
        className="
          w-full max-w-none
         space-y-6 text-white
        "
      >
        {/* HEADER */}
        <PageHeader
          title="Workshops & Events"
          subtitle="Manage and conduct workshops for students"
          rightSlot={
            <div className="relative w-full max-w-[clamp(220px,30vw,360px)]">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-11 pl-11 pr-4 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-lime-400/40"
              />
            </div>
          }
        />

        {/* STATS GRID */}
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <StatTile title="TOTAL" value={`${stats.total}`} icon={<List size={20} />} />
          <StatTile title="UPCOMING" value={`${stats.upcoming}`} icon={<CalendarDays size={20} />} />
          <StatTile title="PARTICIPANTS" value={`${stats.participants}`} icon={<Users size={20} />} />
          <StatTile title="COMPLETED" value={`${stats.completed}`} icon={<CheckCircle size={20} />} />
        </div>

        {/* STATES */}
        {loadingEvents && (
          <ParentTimellyLoader preset="workshops" compact className="w-full" />
        )}

        {eventsError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {eventsError}
          </div>
        )}

        {!loadingEvents && !eventsError && filteredEvents.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/50">
            No workshops found.
          </div>
        )}

        {/* EVENTS GRID (AUTO RESPONSIVE) */}
        <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {paginatedEvents.map((event) => {
            const dateValue = event.eventDate
              ? new Date(event.eventDate)
              : null;

            const status =
              dateValue &&
              !Number.isNaN(dateValue.getTime()) &&
              dateValue.getTime() < Date.now()
                ? "completed"
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
                hasCertificate={event.hasCertificate}
                teacherName={event.teacher?.name ?? ""}
                status={status}
                photo={event.photo}
                additionalInfo={event.additionalInfo}
                showActions={false}
                onViewDetails={() => {
                  setSelectedEventId(event.id);
                  setDetailsOpen(true);
                }}
              />
            );
          })}
        </div>

        {!loadingEvents && !eventsError && filteredEvents.length > 0 && totalPages > 1 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-xs text-white/60">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* MODAL */}
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
          showEnrollAction
          onEnrollSuccess={() => {
            fetchEvents();
            if (selectedEventId) {
              fetch(`/api/events/create/${selectedEventId}`, { credentials: "include" })
                .then((r) => r.json())
                .then((d) => d?.event && setEventDetails(d.event))
                .catch(() => {});
            }
          }}
        />
      </div>
    </div>
  );
}
