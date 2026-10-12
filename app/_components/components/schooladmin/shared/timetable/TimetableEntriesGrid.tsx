import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import { classLabel, type ClassOption, type EditableEntry, type TeacherOption } from "./timetableTypes";

export function TimetableEntriesGrid({
  selectedDayLabel,
  selectedDayEntries,
  selectedClass,
  teachers,
  saving,
  selectedClassId,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  onSave,
}: {
  selectedDayLabel: string;
  selectedDayEntries: EditableEntry[];
  selectedClass: ClassOption | null;
  teachers: TeacherOption[];
  saving: boolean;
  selectedClassId: string;
  onAddEntry: () => void;
  onUpdateEntry: (clientId: string, patch: Partial<EditableEntry>) => void;
  onRemoveEntry: (clientId: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-lime-300" />
            {selectedDayLabel} Grid
          </h3>
          <p className="text-sm text-white/55">Customize periods and breaks for the selected day.</p>
        </div>
        <button
          type="button"
          onClick={onAddEntry}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-300"
        >
          <Plus className="h-4 w-4" />
          Add Row
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        {selectedDayEntries.length === 0 ? (
          <div className="border border-dashed border-white/15 p-8 text-center text-white/55">
            No periods added for {selectedDayLabel}. Start with Add Row.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Period / Break</th>
                  <th className="px-3 py-3 font-semibold">Subject</th>
                  <th className="px-3 py-3 font-semibold">Start</th>
                  <th className="px-3 py-3 font-semibold">End</th>
                  <th className="px-3 py-3 font-semibold">Teacher</th>
                  <th className="px-3 py-3 font-semibold">Class</th>
                  <th className="px-3 py-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {selectedDayEntries.map((entry) => (
                  <tr key={entry.clientId} className="bg-white/3">
                    <td className="px-3 py-3">
                      <select
                        value={entry.slotType}
                        onChange={(event) => onUpdateEntry(entry.clientId, { slotType: event.target.value })}
                        className="w-full min-w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                      >
                        <option value="PERIOD" className="bg-slate-950">Period</option>
                        <option value="BREAK" className="bg-slate-950">Break</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={entry.title}
                        onChange={(event) => onUpdateEntry(entry.clientId, { title: event.target.value })}
                        className="w-full min-w-36 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        placeholder={entry.slotType === "BREAK" ? "Lunch Break" : "Maths Period"}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={entry.subject ?? ""}
                        onChange={(event) => onUpdateEntry(entry.clientId, { subject: event.target.value })}
                        disabled={entry.slotType === "BREAK"}
                        className="w-full min-w-32 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                        placeholder={entry.slotType === "BREAK" ? "No subject for break" : "Subject"}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="time"
                        value={entry.startTime}
                        onChange={(event) => onUpdateEntry(entry.clientId, { startTime: event.target.value })}
                        className="w-full min-w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="time"
                        value={entry.endTime}
                        onChange={(event) => onUpdateEntry(entry.clientId, { endTime: event.target.value })}
                        className="w-full min-w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={entry.teacherId ?? ""}
                        onChange={(event) => onUpdateEntry(entry.clientId, { teacherId: event.target.value })}
                        className="w-full min-w-36 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                      >
                        <option value="" className="bg-slate-950">No teacher</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id} className="bg-slate-950">
                            {teacher.name ?? teacher.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block min-w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                        {classLabel(selectedClass)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveEntry(entry.clientId)}
                        className="inline-flex items-center justify-center rounded-xl border border-red-400/20 px-3 py-2 text-red-200 hover:bg-red-500/10"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !selectedClassId}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-5 py-3 text-sm font-semibold text-black hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Timetable"}
        </button>
      </div>
    </section>
  );
}
