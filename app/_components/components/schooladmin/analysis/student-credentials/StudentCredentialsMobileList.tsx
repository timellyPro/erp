"use client";

import type { StudentCredentialRow } from "./types";

function PasswordCell({ row }: { row: StudentCredentialRow }) {
  if (!row.accountActive) {
    return <span className="text-white/40">—</span>;
  }
  if (row.passwordVerified) {
    return (
      <span className="font-mono text-sm text-lime-300">{row.password}</span>
    );
  }
  return (
    <span className="text-sm text-amber-300/90">Not matching — reset required</span>
  );
}

type Props = {
  rows: StudentCredentialRow[];
};

/** Card layout for phone & tablet — easier to read than a wide table. */
export default function StudentCredentialsMobileList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 py-10 text-center text-sm text-white/40 lg:hidden">
        No students found for this filter.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 lg:hidden">
      {rows.map((row) => (
        <li
          key={`${row.admissionNumber}-${row.email}`}
          className="rounded-xl border border-white/10 bg-black/25 p-3.5 shadow-sm backdrop-blur-sm sm:p-4"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{row.name}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-sky-200/90">{row.email}</p>
            </div>
            <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/55">
              {row.className || "—"}
              {row.section ? ` · ${row.section}` : ""}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-white/40">DOB</dt>
              <dd className="mt-0.5 tabular-nums text-white/90">{row.dob || "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Password</dt>
              <dd className="mt-0.5">
                <PasswordCell row={row} />
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-white/40">Admission no.</dt>
              <dd className="mt-0.5 font-mono text-white/90">{row.admissionNumber}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
