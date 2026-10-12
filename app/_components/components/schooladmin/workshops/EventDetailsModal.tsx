"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Clock, MapPin, Info, X } from "lucide-react";
import { AVATAR_URL } from "../../../constants/images";
import { fetchEventRegistrations, registerForEvent } from "@/lib/api/events";
import { formatDate, formatTime, EventDetailsSidebar } from "./shared/event-details";

interface EventDetailsModalProps {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  event?: {
    id: string;
    title: string;
    description?: string | null;
    eventDate?: string | null;
    location?: string | null;
    mode?: string | null;
    type?: string | null;
    level?: string | null;
    additionalInfo?: string | null;
    photo?: string | null;
    maxSeats?: number | null;
    amount?: number | null;
    isRegistered?: boolean;
    registration?: { id: string; paymentStatus: string } | null;
    teacher?: { name?: string | null; email?: string | null; photoUrl?: string | null } | null;
    _count?: { registrations: number };
    workshopCertificate?: {
      id: string;
      title: string;
      certificateUrl: string | null;
      issuedDate: string;
    } | null;
  } | null;
  showEnrollAction?: boolean;
  showEnrolledStudents?: boolean;
  onEnrollSuccess?: () => void;
}

export default function EventDetailsModal({
  open,
  onClose,
  loading,
  error,
  event,
  showEnrollAction = false,
  showEnrolledStudents = false,
  onEnrollSuccess,
}: EventDetailsModalProps) {
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolledStudents, setEnrolledStudents] = useState<
    Array<{ id: string; registrationId: string; name: string | null; email: string | null; class: string | null; paymentStatus: string }>
  >([]);

  useEffect(() => {
    if (open && showEnrolledStudents && event?.id) {
      fetchEventRegistrations(event.id)
        .then(({ data }) => {
          if (data?.students) setEnrolledStudents(data.students);
          else setEnrolledStudents([]);
        })
        .catch(() => setEnrolledStudents([]));
    } else {
      setEnrolledStudents([]);
    }
  }, [open, showEnrolledStudents, event?.id]);

  if (!open) return null;

  const isUpcoming = event?.eventDate
    ? new Date(event.eventDate).getTime() >= Date.now()
    : true;
  const statusLabel = isUpcoming ? "Upcoming" : "Completed";

  const isRegistered = event?.isRegistered ?? enrolled;
  const registration = event?.registration ?? null;
  const eventAmount = event?.amount ?? 0;
  const needsPayment = isRegistered && eventAmount > 0 && registration?.paymentStatus === "PENDING";
  const enrolledCount = event?._count?.registrations ?? 0;
  const maxSeats = event?.maxSeats ?? null;
  const isFull = maxSeats != null && maxSeats > 0 && enrolledCount >= maxSeats;
  const canEnroll = showEnrollAction && isUpcoming && !isRegistered && !isFull;

  const handleEnroll = async () => {
    if (!event?.id || !canEnroll) return;
    setEnrollLoading(true);
    setEnrollError(null);
    try {
      const { ok, data } = await registerForEvent(event.id);
      if (!ok) throw new Error(data?.message || "Enrollment failed");
      setEnrolled(true);
      onEnrollSuccess?.();
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setEnrollLoading(false);
    }
  };
  const instructorImage =
    event?.teacher?.photoUrl && event.teacher.photoUrl.trim() !== ""
      ? event.teacher.photoUrl
      : AVATAR_URL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-[94vw] sm:max-w-2xl lg:max-w-5xl bg-[#0F172A] border border-gray-400/30 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden animate-fadeIn">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 text-white/60 hover:text-white transition cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 pr-10">
          <h3 className="text-lg sm:text-2xl font-semibold text-white">
            {event?.title || "Event Details"}
          </h3>
          <span className="inline-flex items-center rounded-full bg-lime-400/20 px-3 py-1 text-xs font-semibold text-lime-300">
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] sm:text-sm text-white/70">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-lime-300" />
            <span>{formatDate(event?.eventDate) || "Date"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-lime-300" />
            <span>{formatTime(event?.eventDate) || "Time"}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-lime-300" />
            <span className="truncate">{event?.location || "Location"}</span>
          </div>
        </div>

        <div className="mt-4 max-h-[72vh] overflow-y-auto pr-1 sm:pr-2 no-scrollbar">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
              Loading event details...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {event?.photo ? (
                  <img
                    src={event.photo}
                    alt={event?.title || "Event"}
                    className="h-48 sm:h-60 w-full object-cover"
                  />
                ) : (
                  <div className="h-48 sm:h-60 w-full bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1220]" />
                )}
              </div>

              <div className="mt-5 sm:mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="lg:col-span-2 space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2 text-white font-semibold">
                      <span className="h-6 w-6 rounded-full text-lime-300 flex items-center justify-center">
                        <Info size={18} />
                      </span>
                      About the Event
                    </div>
                    <p className="mt-3 text-sm text-white/70 leading-relaxed">
                      {event?.description || "No description available."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:px-5 sm:py-4">
                    <div className="text-sm font-semibold text-white">
                      Additional Information
                    </div>
                    <p className="mt-2 text-gray-400 text-sm italic leading-relaxed">
                      {event?.additionalInfo || "No additional information provided."}
                    </p>
                  </div>
                </div>

                <EventDetailsSidebar
                  instructorImage={instructorImage}
                  teacherName={event?.teacher?.name}
                  teacherEmail={event?.teacher?.email}
                  showEnrolledStudents={showEnrolledStudents}
                  enrolledStudents={enrolledStudents}
                  maxSeats={maxSeats}
                  enrolledCount={enrolledCount}
                  eventAmount={eventAmount}
                  showEnrollAction={showEnrollAction}
                  workshopCertificate={event?.workshopCertificate}
                  enrollError={enrollError}
                  isRegistered={isRegistered}
                  needsPayment={needsPayment}
                  registrationId={registration?.id}
                  onEnrollSuccess={onEnrollSuccess}
                  isFull={isFull}
                  enrollLoading={enrollLoading}
                  onEnroll={handleEnroll}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
