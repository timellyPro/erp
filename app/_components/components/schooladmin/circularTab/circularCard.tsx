"use client";

import { useState } from "react";
import { Calendar, FileText, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { CircularRow } from "./types";
import { getImportanceBorderColor, getInitial } from "./helpers";
import { CIRCULAR_PUBLISHED_GREEN } from "@/app/_components/constants/colors";

export default function CircularCard({ c }: { c: CircularRow }) {
  const [expanded, setExpanded] = useState(false);
  const contentPreview = c.content.length > 200 ? c.content.slice(0, 200) + "…" : c.content;
  const hasMoreContent = c.content.length > 200;
  const attachments = c.attachments ?? [];

  return (
    <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border border-white/10 w-full min-w-0 break-words">
      <div
        className="h-1"
        style={{ background: getImportanceBorderColor(c.importanceLevel) }}
      />

      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        <span className="text-xs text-white/50 font-mono block truncate">
          {c.referenceNumber}
        </span>

        <h3 className="text-base sm:text-lg font-bold text-white">
          {c.subject}
        </h3>

        <p className="text-sm text-white/70 whitespace-pre-wrap break-words">
          {expanded ? c.content : contentPreview}
          {hasMoreContent && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-lime-400 hover:text-lime-300 text-sm font-medium"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </p>

        {attachments.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/60 flex items-center gap-1">
              <FileText size={14} /> Attachments
            </span>
            <div className="flex flex-wrap gap-2">
              {attachments.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-400/10 text-lime-400 text-sm border border-lime-400/30 hover:bg-lime-400/20 transition"
                >
                  <ExternalLink size={14} className="shrink-0" />
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">
                    Attachment {i + 1}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {(c.recipients?.length > 0 || c.targetClass) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {c.targetClass && (
              <span className="px-2 py-0.5 rounded-lg bg-lime-400/20 text-lime-400">
                {c.targetClass.name}{c.targetClass.section ? ` ${c.targetClass.section}` : ""}
              </span>
            )}
            {(c.recipients ?? []).filter((r) => r !== "all").map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-lg bg-white/10 text-white/80 capitalize">
                {r}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-white min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: CIRCULAR_PUBLISHED_GREEN }}
            >
              {getInitial(c.issuedBy?.name)}
            </div>
            <span className="truncate">{c.issuedBy?.name}</span>
          </div>

          <div className="flex items-center gap-1 text-white/70 text-sm shrink-0">
            <Calendar size={14} />
            {formatDate(c.date)}
          </div>
        </div>
      </div>
    </div>
  );
}
