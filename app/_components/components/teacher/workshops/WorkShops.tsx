"use client";

import HeaderActionButton from "../../common/HeaderActionButton";
import PageHeader from "../../common/PageHeader";
import SearchInput from "../../common/SearchInput";
import CreateEventForm from "../../schooladmin/workshops/CreateEventForm";
import EventDetailsModal from "../../schooladmin/workshops/EventDetailsModal";
import DeleteEventModal from "../../schooladmin/workshops/DeleteEventModal";
import { Plus, Search, X, type LucideIcon } from "lucide-react";
import { useTeacherWorkshopsState } from "./shared";
import { WorkshopStatTiles } from "./shared";
import { WorkshopEventsList } from "./shared";

export default function TeacherWorkshopsTab() {
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
    search,
    setSearch,
    formRef,
    setCurrentPage,
    pageSize,
    handleCreated,
    stats,
    filteredEvents,
    totalPages,
    clampedPage,
    pagedEventsWithStatus,
    handleDeleteConfirm,
  } = useTeacherWorkshopsState();

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

        <WorkshopStatTiles stats={stats} />

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
          onConfirm={handleDeleteConfirm}
        />

        <WorkshopEventsList
          loadingEvents={loadingEvents}
          events={events}
          eventsError={eventsError}
          filteredEvents={filteredEvents}
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
