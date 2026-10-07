"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Clock, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { ExamScheduleItem } from "@/hooks/useExamTerms";
import Spinner from "@/app/frontend/components/common/Spinner";
import {
  EXAM_ACCENT,
  EXAM_ACCENT_GLOW,
  EXAM_TEXT_MAIN,
  EXAM_TEXT_SECONDARY,
  EXAM_CARD_BG_ALT,
  EXAM_INPUT_BG,
} from "@/app/frontend/constants/colors";

interface ExamScheduleTabProps {
  termId: string;
  schedules: ExamScheduleItem[];
  onScheduleChange?: () => void;
}

function formatDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min} min`;
}

export default function ExamScheduleTab({ termId, schedules, onScheduleChange }: ExamScheduleTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [examDate, setExamDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMin, setDurationMin] = useState(180);
  const [saving, setSaving] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);

  const orderedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const aDate = new Date(`${a.examDate}T${a.startTime || "00:00"}`).getTime();
        const bDate = new Date(`${b.examDate}T${b.startTime || "00:00"}`).getTime();
        return aDate - bDate;
      }),
    [schedules]
  );

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !examDate || !startTime) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/exams/terms/${termId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          examDate,
          startTime,
          durationMin,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add");

      setSubject("");
      setExamDate("");
      setStartTime("");
      setDurationMin(180);
      setShowAddModal(false);
      onScheduleChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exam-subjects", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const list = Array.isArray(data.subjects)
          ? data.subjects
              .map((name: string) => name?.trim())
              .filter((name: string) => Boolean(name))
          : [];
        setSubjectOptions(list);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5 bg-transparent">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider" style={{ color: EXAM_TEXT_MAIN }}>
          Schedule
        </h3>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1 bg-lime-400/10
           px-3 py-1.5 rounded-lg border border-lime-400/20 transition-all"
          style={{
            color: EXAM_ACCENT,
            backgroundColor: "rgba(159, 255, 0, 0.12)",
          }}
        >
          <Plus size={18} />
          Add Subject
        </button>
      </div>

      {!orderedSchedules.length ? (
        <div className="rounded-2xl border border-white/10 py-14 text-center" style={{ color: EXAM_TEXT_SECONDARY }}>
          No exam schedule added yet. Click "Add Subject" to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {orderedSchedules.map((s) => {
            const date = new Date(s.examDate);
            const day = date.getDate();
            const month = date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
            const durationStr = formatDuration(s.durationMin);

            return (
              <div
                key={s.id}
                className="bg-white/5 hover:bg-white/[0.07] rounded-xl border border-white/5 p-4 flex items-center gap-6 group transition-all"
               
              >
                <div className="flex flex-col items-center justify-center min-w-[50px]">
                  <div className="text-lg font-bold text-white leading-none" style={{ color: EXAM_TEXT_MAIN }}>
                    {day}
                  </div>
                  <div className="text-[10px] font-medium text-gray-500 uppercase mt-1" style={{ color: EXAM_TEXT_SECONDARY }}>
                    {month}
                  </div>
                </div>

                <div className="w-px h-10 bg-white/10" />

                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-gray-200" style={{ color: EXAM_TEXT_MAIN }}>
                    {s.subject}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500" style={{ color: EXAM_TEXT_SECONDARY }}>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>
                    <span>{s.startTime}</span></span>
                    
                    <span className="mx-1">•</span>
                    <span>{durationStr} duration</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal &&
        createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(10,27,57,0.98) 0%, rgba(9,22,47,0.96) 100%)",
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-bold" style={{ color: EXAM_TEXT_MAIN }}>
                Add Subject to Schedule
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-white/15 p-2.5 text-white/80 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSchedule} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: EXAM_TEXT_SECONDARY }}>
                  Subject Name
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                  list="schooladmin-exam-subject-options"
                  required
                  className="w-full rounded-2xl border border-white/15 px-4 py-3.5 text-base"
                  style={{ background: EXAM_INPUT_BG, color: EXAM_TEXT_MAIN }}
                />
                <datalist id="schooladmin-exam-subject-options">
                  {subjectOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: EXAM_TEXT_SECONDARY }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/15 px-4 py-3.5 text-base [color-scheme:dark]"
                    style={{ background: EXAM_INPUT_BG, color: EXAM_TEXT_MAIN }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: EXAM_TEXT_SECONDARY }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/15 px-4 py-3.5 text-base [color-scheme:dark]"
                    style={{ background: EXAM_INPUT_BG, color: EXAM_TEXT_MAIN }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: EXAM_TEXT_SECONDARY }}>
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
                  min={1}
                  className="w-full rounded-2xl border border-white/15 px-4 py-3.5 text-base"
                  style={{ background: EXAM_INPUT_BG, color: EXAM_TEXT_MAIN }}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-lime-400 text-black font-bold hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: EXAM_ACCENT,
                    boxShadow: `0 0 18px ${EXAM_ACCENT_GLOW}`,
                  }}
                >
                  {saving ? (
                    <>
                      <Spinner size={18} />
                      Saving...
                    </>
                  ) : (
                    "Save Schedule"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
