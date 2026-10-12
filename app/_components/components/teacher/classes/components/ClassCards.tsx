"use client";

import StatCard from "../../../common/statCard";
import type { TeacherClass } from "../hooks/useTeacherClasses";
import { Users } from "lucide-react";

type ClassCardsProps = {
  classes: TeacherClass[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const getClassLabel = (c: TeacherClass) =>
  c.section ? `${c.name}-${c.section}` : c.name;

const getSubjectLabel = (c: TeacherClass) =>
  c.teacher?.subject?.trim() || "Not assigned";

export default function ClassCards({
  classes,
  selectedId,
  onSelect,
}: ClassCardsProps) {
  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60">
        No classes available yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {classes.map((c) => {
        const isActive = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="text-left"
            aria-pressed={isActive}
          >
            <StatCard
              className={`bg-white/5 transition-all ${
                isActive
                  ? "border-lime-400/40 shadow-[0_0_20px_rgba(163,230,53,0.2)]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-white/5">
                  <Users size={18} className={isActive?"text-lime-400":"text-gray-400"} />
                </div>
                {isActive && (
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.6)]" />
                )}
              </div>
              <div className="mt-5">
                <h4 className="text-lg font-semibold text-white">
                  {getClassLabel(c)}
                </h4>
                <p className="text-sm text-lime-300 mt-1">
                  Subject: {getSubjectLabel(c)}
                </p>
                <p className="text-xs text-white/60 mt-2">
                  {c._count?.students ?? 0} Students
                </p>
              </div>
            </StatCard>
          </button>
        );
      })}
    </div>
  );
}
