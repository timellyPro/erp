import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import type { MessDuplicateIssue } from "@/lib/fees/findMessFeeDuplicateIssues";

export function DuplicateWarningBanner({
  duplicateRowCount,
  duplicateIssues,
  showDuplicateList,
  setShowDuplicateList,
  runDuplicateCleanup,
  cleanupBusy,
  tableSaving,
}: {
  duplicateRowCount: number;
  duplicateIssues: MessDuplicateIssue[];
  showDuplicateList: boolean;
  setShowDuplicateList: (updater: (v: boolean) => boolean) => void;
  runDuplicateCleanup: () => void;
  cleanupBusy: boolean;
  tableSaving: boolean;
}) {
  if (duplicateRowCount === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-lime-500/25 bg-lime-500/10 px-4 py-2.5 text-xs text-lime-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        No duplicate mess fees detected for this school.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-100">
              {duplicateRowCount} duplicate mess fee row(s) found
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
              Old bulk student mess fees or extra copies can inflate totals. Remove them from
              the database (not hidden in UI only).
            </p>
            <button
              type="button"
              onClick={() => setShowDuplicateList((v) => !v)}
              className="mt-2 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
            >
              {showDuplicateList ? "Hide details" : "Show details"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={runDuplicateCleanup}
          disabled={cleanupBusy || tableSaving}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 text-sm font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
        >
          {cleanupBusy ? (
            "Removing…"
          ) : (
            <>
              <Trash2 className="h-4 w-4" />
              Remove duplicates
            </>
          )}
        </button>
      </div>
      {showDuplicateList && (
        <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-amber-500/20 pt-3">
          {duplicateIssues.map((issue: MessDuplicateIssue) => (
            <li
              key={issue.id}
              className="rounded-lg bg-black/25 px-3 py-2 text-xs text-amber-100/90"
            >
              <span className="font-semibold text-amber-200">{issue.classLabel}</span>
              <span className="text-amber-100/70"> — {issue.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
