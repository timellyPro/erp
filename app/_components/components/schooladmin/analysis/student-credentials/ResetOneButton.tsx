"use client";

import type { StudentCredentialRow } from "./types";

export type ResetOneProps = {
  onResetOne: (row: StudentCredentialRow) => void;
  resettingId: string | null;
  /** True while a class-wide reset runs, so the two cannot overlap. */
  busy: boolean;
};

/** Resets just this student's login to the DOB password. */
export function ResetOneButton({
  row,
  onResetOne,
  resettingId,
  busy,
}: ResetOneProps & { row: StudentCredentialRow }) {
  const working = resettingId === row.studentId;
  return (
    <button
      type="button"
      onClick={() => onResetOne(row)}
      disabled={working || busy || resettingId !== null}
      className="mt-1 block rounded-md border border-amber-400/40 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {working ? "Resetting…" : "Reset this student"}
    </button>
  );
}
