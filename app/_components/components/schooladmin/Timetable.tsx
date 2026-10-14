"use client";

import PageHeader from "../common/PageHeader";
import TimellyLoader from "../common/TimellyLoader";
import TimetableGrid from "../timetable/TimetableGrid";
import { useTimetableState, TimetableEntriesGrid, classLabel, DAYS } from "./shared/timetable";

export default function SchoolAdminTimetableTab() {
  const {
    classes,
    teachers,
    selectedClassId,
    setSelectedClassId,
    selectedDay,
    setSelectedDay,
    loading,
    loadingTimetable,
    saving,
    error,
    success,
    selectedClass,
    selectedDayLabel,
    previewTimetable,
    selectedDayEntries,
    entryCountByDay,
    addEntry,
    updateEntry,
    removeEntry,
    handleSave,
  } = useTimetableState();

  if (loading) {
    return (
      <TimellyLoader
        title="Loading timetable"
        steps={["Classes", "Teachers", "Schedules"]}
      />
    );
  }

  return (
    <div className="min-h-screen space-y-6 text-white">
      <PageHeader
        title="Timetable"
        subtitle="Select a class, choose a day, then customize that day's periods and breaks in the grid."
      />

      <section className="rounded-3xl border border-white/10 bg-white/4 p-5">
        <label className="block max-w-sm space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Class</span>
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-lime-300/50"
          >
            {classes.map((classRow) => (
              <option key={classRow.id} value={classRow.id} className="bg-slate-950">
                {classLabel(classRow)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Select Day</h3>
          <p className="text-sm text-white/55">
            Choose the day you want to customize for {classLabel(selectedClass)}.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {DAYS.map((day) => {
            const count = entryCountByDay.get(day.value) ?? 0;
            const isActive = selectedDay === day.value;
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => setSelectedDay(day.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-lime-300 bg-lime-300/15 text-lime-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-semibold">{day.label}</span>
                <span className="text-xs text-white/45">{count} row{count === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-lime-300/25 bg-lime-400/10 p-4 text-sm text-lime-100">{success}</div> : null}
      {loadingTimetable ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          Loading selected class timetable...
        </div>
      ) : null}

      <TimetableEntriesGrid
        selectedDayLabel={selectedDayLabel}
        selectedDayEntries={selectedDayEntries}
        selectedClass={selectedClass}
        teachers={teachers}
        saving={saving}
        selectedClassId={selectedClassId}
        onAddEntry={() => addEntry()}
        onUpdateEntry={updateEntry}
        onRemoveEntry={removeEntry}
        onSave={() => void handleSave()}
      />

      <TimetableGrid timetable={previewTimetable} emptyMessage="Add valid rows to preview the timetable." />
    </div>
  );
}
