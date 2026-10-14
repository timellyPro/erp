"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SyllabusItem } from "@/app/_components/hooks/useExamTerms";
import { addSyllabusSubject, addSyllabusUnit } from "@/lib/api/syllabus";
import Spinner from "@/app/_components/components/common/Spinner";
import {
  EXAM_ACCENT,
  EXAM_TEXT_MAIN,
  EXAM_TEXT_SECONDARY,
  EXAM_PROGRESS_GREEN,
  EXAM_PROGRESS_YELLOW,
  EXAM_PROGRESS_EMPTY,
  EXAM_CARD_TRANSPARENT,
  EXAM_INPUT_BG,
} from "@/app/_components/constants/colors";

function getProgressBarColor(percent: number) {
  if (percent >= 100) return EXAM_PROGRESS_GREEN;
  if (percent > 0) return EXAM_PROGRESS_YELLOW;
  return EXAM_PROGRESS_EMPTY;
}

interface SyllabusTrackingTabProps {
  termId: string;
  syllabus: SyllabusItem[];
  onSyllabusChange: () => void;
}

export default function SyllabusTrackingTab({
  termId,
  syllabus,
  onSyllabusChange,
}: SyllabusTrackingTabProps) {
  const [addingSubject, setAddingSubject] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingNewSubject, setAddingNewSubject] = useState(false);
  const [addingUnitForSubject, setAddingUnitForSubject] = useState<string | null>(null);

  const addSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    setAddingNewSubject(true);
    try {
      const { ok, data } = await addSyllabusSubject(termId, name);
      if (!ok) {
        throw new Error(data.message || "Failed to add subject");
      }
      setNewSubjectName("");
      onSyllabusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add subject");
    } finally {
      setAddingNewSubject(false);
    }
  };

  const addUnit = async (subject: string) => {
    const unitName = newUnitName.trim();
    if (!unitName) return;
    const subjectItem = syllabus.find((s) => s.subject === subject);
    const nextOrder = subjectItem?.units?.length ?? 0;
    setAddingUnitForSubject(subject);
    try {
      const { ok, data } = await addSyllabusUnit(termId, { subject, unitName, order: nextOrder });
      if (!ok) throw new Error(data.message || "Failed to add unit");
      setNewUnitName("");
      setAddingSubject(null);
      onSyllabusChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add unit");
    } finally {
      setAddingUnitForSubject(null);
    }
  };

  return (
    <div className="min-h-[280px] sm:min-h-[400px] rounded-xl sm:rounded-2xl p-4 sm:p-6 -m-4 sm:-m-6 md:-mx-6 md:-mb-6 border border-white/5 bg-white/[0.04] backdrop-blur-[8px]">
      <div className="space-y-5 sm:space-y-8">
        <div>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubject()}
              placeholder="Add new subject..."
              className="flex-1 w-full sm:max-w-xs rounded-lg px-3 py-3 sm:py-2.5 text-sm border border-white/15 placeholder:opacity-70 min-h-[44px] touch-manipulation text-base"
              style={{
                background: EXAM_INPUT_BG,
                color: EXAM_TEXT_MAIN,
              }}
            />
            <button
              type="button"
              onClick={addSubject}
              disabled={addingNewSubject || !newSubjectName.trim()}
              className="px-4 py-3 sm:py-2.5 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 transition hover:opacity-90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              style={{
                backgroundColor: EXAM_ACCENT,
                color: "#1A1A1A",
              }}
            >
              {addingNewSubject ? (
                <Spinner size={16} />
              ) : (
                <Plus size={16} className="flex-shrink-0" />
              )}{" "}
              Add subject
            </button>
          </div>
        </div>

        {!syllabus.length ? (
          <div
            className="py-8 text-center text-sm"
            style={{ color: EXAM_TEXT_SECONDARY }}
          >
            No subjects yet. Add a subject above.
          </div>
        ) : null}

        {syllabus.map((s) => {
          const unitCount = s.units?.length ?? 0;
          const isAdding = addingSubject === s.subject;

          return (
            <div key={s.id} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 min-w-0">
                <h3
                  className="font-semibold text-sm sm:text-base break-words"
                  style={{ color: EXAM_TEXT_MAIN }}
                >
                  {s.subject}
                </h3>
                <span
                  className="text-xs sm:text-sm px-2 py-0.5 rounded w-fit"
                  style={{
                    color: EXAM_TEXT_SECONDARY,
                    background: "rgba(255,255,255,0.08)",
                  }}
                >
                  {unitCount} Units
                </span>
                <div className="flex-1 flex items-center gap-2 min-w-0 w-full sm:max-w-[200px]">
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden min-w-0"
                    style={{ background: EXAM_PROGRESS_EMPTY }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(s.completedPercent, 100)}%`,
                        background: getProgressBarColor(s.completedPercent),
                      }}
                    />
                  </div>
                  <span
                    className="text-xs sm:text-sm tabular-nums shrink-0"
                    style={{ color: EXAM_TEXT_MAIN }}
                  >
                    {s.completedPercent}%
                  </span>
                </div>
              </div>

              <ul className="space-y-2">
                {(s.units ?? []).map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-3.5 rounded-lg sm:rounded-xl border border-white/10 min-h-[44px]"
                    style={{
                      background: EXAM_CARD_TRANSPARENT,
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    <span
                      className="flex-1 font-medium text-sm sm:text-base break-words min-w-0"
                      style={{ color: EXAM_TEXT_MAIN }}
                    >
                      {u.unitName}
                    </span>
                    <div className="w-full sm:w-28 flex items-center gap-2 shrink-0">
                      <div
                        className="flex-1 h-2 rounded-full overflow-hidden min-w-0"
                        style={{ background: EXAM_PROGRESS_EMPTY }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(u.completedPercent, 100)}%`,
                            background: getProgressBarColor(u.completedPercent),
                          }}
                        />
                      </div>
                      <span
                        className="text-xs tabular-nums w-8 shrink-0"
                        style={{ color: EXAM_TEXT_SECONDARY }}
                      >
                        {u.completedPercent}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {isAdding ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <input
                    type="text"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addUnit(s.subject)}
                    placeholder="Add new unit/topic..."
                    className="flex-1 rounded-lg px-3 py-3 text-sm border border-white/15 placeholder:opacity-70 min-h-[44px] touch-manipulation text-base w-full"
                    style={{
                      background: EXAM_INPUT_BG,
                      color: EXAM_TEXT_MAIN,
                    }}
                    autoFocus
                    disabled={addingUnitForSubject === s.subject}
                  />
                  <button
                    type="button"
                    onClick={() => addUnit(s.subject)}
                    disabled={addingUnitForSubject === s.subject}
                    className="p-3 sm:p-2.5 rounded-xl sm:rounded-lg transition hover:opacity-90 min-h-[44px] min-w-[44px] touch-manipulation flex items-center justify-center disabled:opacity-60 w-full sm:w-auto"
                    style={{ backgroundColor: EXAM_ACCENT, color: "#1A1A1A" }}
                  >
                    {addingUnitForSubject === s.subject ? (
                      <Spinner size={16} />
                    ) : (
                      <Plus size={18} />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingSubject(s.subject);
                    setNewUnitName("");
                  }}
                  className="mt-2 text-sm flex items-center gap-1.5 transition hover:opacity-90 min-h-[44px] touch-manipulation py-2 px-1 -mx-1 rounded-lg active:bg-white/5"
                  style={{ color: EXAM_TEXT_SECONDARY }}
                >
                  <Plus size={14} className="flex-shrink-0" /> Add new unit/topic...
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
