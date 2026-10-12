"use client";

import { History, Zap } from "lucide-react";
import type { AuditRecord } from "./types";
import { categoryToLabel } from "./types";

interface PerformanceHistoryProps {
  records: AuditRecord[];
}

export default function PerformanceHistory({ records }: PerformanceHistoryProps) {
  return (
    <div className="space-y-4">

      {/* HEADER BAR */}
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/90">
        <History className="w-4 h-4 text-white/70" />
        PERFORMANCE HISTORY
      </div>

      {/* EMPTY STATE */}
      {records.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-white/60">
          No records yet.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-black/10 px-4 py-3"
            >
              {/* LEFT CONTENT */}
              <div className="flex items-start gap-3 min-w-0">

                {/* ICON BUBBLE */}
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Zap
                    className={`w-4 h-4 ${
                      r.scoreImpact >= 0 ? "text-lime-400" : "text-red-400"
                    }`}
                  />
                </div>

                {/* TEXT */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {categoryToLabel(r.category, r.customCategory)}
                    </span>
                    <span className="text-xs text-white/50">
                      {new Date(r.createdAt).toLocaleDateString("en-CA")}
                    </span>
                  </div>

                  <p className="text-sm text-white/70 mt-1 truncate">
                    {r.description}
                  </p>
                </div>
              </div>

              {/* SCORE IMPACT */}
              <span
                className={`text-sm font-semibold flex-shrink-0 ${
                  r.scoreImpact >= 0 ? "text-lime-400" : "text-red-400"
                }`}
              >
                {r.scoreImpact >= 0 ? `+${r.scoreImpact}` : r.scoreImpact}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
