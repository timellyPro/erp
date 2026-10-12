"use client";

import HeaderActionButton from "../common/HeaderActionButton";
import PageHeader from "../common/PageHeader";
import CreateHub from "./workshops/CreateHub";
import CreateEventForm from "./workshops/CreateEventForm";
import EventDetailsModal from "./workshops/EventDetailsModal";
import DeleteEventModal from "./workshops/DeleteEventModal";
import { Plus, X, type LucideIcon } from "lucide-react";
import { useWorkshopsAndEventsState, WorkshopsStatTiles, WorkshopsEventsList } from "./shared/workshops-and-events";

export default function WorkshopsAndEventsTab() {
  const {
    activeAction,
    setActiveAction,
    events,
    loadingEvents,
    eventsError,
    detailsOpen,
    setDetailsOpen,
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
    setCurrentPage,
    pageSize,
    handleEventUpsert,
    stats,
    totalPages,
    clampedPage,
    pagedEventsWithStatus,
    handleDeleteConfirm,
  } = useWorkshopsAndEventsState();

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
        <div className="lg:hidden w-full">
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
        <div className="hidden lg:block">
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
    <div className=" pb-24 lg:pb-6 text-gray-200">
      <div className="w-full space-y-6">
        <PageHeader
          title="Workshops & Events"
          subtitle="Plan, manage, and issue certificates for workshops and events"
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-5 md:p-6 border border-white/10 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4"
          rightSlot={
            <div className="w-full lg:w-auto">
              <div className="flex flex-wrap gap-2 sm:gap-3 lg:justify-end">
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

        <WorkshopsStatTiles stats={stats} />

        <CreateHub events={events} />

        {activeAction === "workshop" && (
          <div ref={formRef}>
            <CreateEventForm
              onCancel={() => {
                setActiveAction("none");
                setEditingEvent(null);
              }}
              onCreated={handleEventUpsert}
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
          showEnrolledStudents
        />

        <DeleteEventModal
          open={Boolean(deleteTarget)}
          title={deleteTarget?.title}
          loading={deleteLoading}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />

        <WorkshopsEventsList
          loadingEvents={loadingEvents}
          events={events}
          eventsError={eventsError}
          pagedEventsWithStatus={pagedEventsWithStatus}
          pageSize={pageSize}
          clampedPage={clampedPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          onViewDetails={(eventId) => {
            setSelectedEventId(eventId);
            setDetailsOpen(true);
          }}
          onEdit={(event) => {
            setEditingEvent(event);
            setActiveAction("workshop");
          }}
          onDelete={(event) => setDeleteTarget(event)}
        />
      </div>
    </div>
  );
}
