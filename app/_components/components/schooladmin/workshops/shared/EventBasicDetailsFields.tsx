import { GraduationCap, Users } from "lucide-react";
import SearchInput from "../../../common/SearchInput";
import EventSelectField from "../EventSelectField";
import { difficultyOptions, eventTypeOptions } from "./createEventFormOptions";

export function EventBasicDetailsFields({
  title,
  setTitle,
  classId,
  setClassId,
  classes,
  classStudents,
  studentIds,
  setStudentIds,
  type,
  setType,
  difficulty,
  setDifficulty,
  description,
  setDescription,
  additionalInfo,
  setAdditionalInfo,
}: {
  title: string;
  setTitle: (v: string) => void;
  classId: string;
  setClassId: (v: string) => void;
  classes: { id: string; name: string; section: string | null }[];
  classStudents: { id: string; user?: { name?: string | null } }[];
  studentIds: string[];
  setStudentIds: (updater: (prev: string[]) => string[]) => void;
  type: string;
  setType: (v: string) => void;
  difficulty: string;
  setDifficulty: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  additionalInfo: string;
  setAdditionalInfo: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="text-xs font-bold text-white/50 uppercase tracking-wider">
        Basic Details
      </div>

      <SearchInput
        label="Event Title"
        placeholder="e.g. Science Fair 2026"
        value={title}
        onChange={setTitle}
        variant="glass"
      />

      <div className="text-xs font-bold text-white/50 uppercase tracking-wider mt-4">
        Target Audience
      </div>
      <div>
        <label className="block text-xs sm:text-sm mb-1 text-white/70 flex items-center gap-1.5">
          <GraduationCap size={14} /> Target Class (optional)
        </label>
        <p className="text-xs text-white/50 mb-2">Restrict to a class, or select specific students below.</p>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="w-full rounded-xl bg-black/30 border border-white/20 text-sm text-white px-4 py-3 focus:outline-none focus:border-lime-400/60"
        >
          <option value="" className="text-black">All classes (open to all)</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id} className="text-black">
              {c.name}{c.section ? ` - ${c.section}` : ""}
            </option>
          ))}
        </select>
      </div>
      {classStudents.length > 0 && (
        <div>
          <label className="block text-xs sm:text-sm mb-1 text-white/70 flex items-center gap-1.5">
            <Users size={14} /> Pre-register students (optional)
          </label>
          <p className="text-xs text-white/50 mb-2">Select specific students to pre-register for this event.</p>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 rounded-xl bg-black/20 border border-white/10">
            {classStudents.map((s) => {
              const sel = studentIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setStudentIds((prev) =>
                      sel ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    sel ? "bg-lime-400/20 text-lime-400 border-lime-400/50" : "bg-white/5 text-gray-400 border-white/10"
                  }`}
                >
                  {s.user?.name ?? "Student"}
                </button>
              );
            })}
          </div>
          {studentIds.length > 0 && (
            <p className="text-xs text-lime-400/80 mt-1">{studentIds.length} student(s) selected</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EventSelectField
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={eventTypeOptions}
          placeholder="Select type"
        />
        <EventSelectField
          label="Difficulty Level"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          options={difficultyOptions}
          placeholder="Select level"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm mb-1 text-white/70">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the event..."
          rows={4}
          className="w-full rounded-xl bg-black/30 border border-white/20 text-sm text-white placeholder-white/40 px-4 py-3 focus:outline-none focus:ring-0 focus:border-lime-400/60 no-scrollbar"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm mb-1 text-white/70">
          Additional Info / Certificates
        </label>
        <textarea
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          placeholder="Details about certificates, prerequisites, or special instructions..."
          rows={4}
          className="w-full rounded-xl bg-black/30 border border-white/20 text-sm text-white placeholder-white/40 px-4 py-3 focus:outline-none focus:ring-0 focus:border-lime-400/60 no-scrollbar"
        />
      </div>
    </div>
  );
}
