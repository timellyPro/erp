"use client";

import type { StudentCredentialRow } from "./types";
import StudentCredentialsMobileList from "./StudentCredentialsMobileList";
import StudentCredentialsPagination from "./StudentCredentialsPagination";

function PasswordCell({ row }: { row: StudentCredentialRow }) {
  if (!row.accountActive) {
    return <span className="text-white/40">—</span>;
  }
  if (row.passwordVerified) {
    return (
      <span className="font-mono text-xs text-lime-300 sm:text-sm">{row.password}</span>
    );
  }
  return (
    <span className="text-xs text-amber-300/90 sm:text-sm">
      Not matching — reset required
    </span>
  );
}

type TableProps = {
  rows: StudentCredentialRow[];
  summaryLabel: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function StudentCredentialsTable({
  rows,
  summaryLabel,
  page,
  totalPages,
  onPageChange,
}: TableProps) {
  return (
    <>
      <p className="mb-3 text-xs text-white/45 sm:text-sm">{summaryLabel}</p>

      <StudentCredentialsMobileList rows={rows} />

      <div className="hidden lg:block">
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-white/10">
          <table className="w-full min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:text-[11px]">
                <th className="py-3 pl-4 pr-3 font-medium">Name</th>
                <th className="py-3 px-2 font-medium">Email (login)</th>
                <th className="py-3 px-2 font-medium">DOB</th>
                <th className="py-3 px-2 font-medium">Password</th>
                <th className="py-3 px-2 font-medium">Class</th>
                <th className="py-3 px-2 font-medium">Section</th>
                <th className="py-3 pl-2 pr-4 font-medium">Admission no.</th>
              </tr>
            </thead>
            <tbody className="text-white/90">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-white/40">
                    No students found for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={`${row.admissionNumber}-${row.email}`}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3"
                  >
                    <td className="py-3 pl-4 pr-3 font-medium text-white">{row.name}</td>
                    <td className="max-w-[180px] truncate py-3 px-2 font-mono text-xs text-sky-200/90 xl:max-w-none xl:whitespace-normal xl:text-sm">
                      {row.email}
                    </td>
                    <td className="py-3 px-2 text-xs tabular-nums sm:text-sm">
                      {row.dob || "—"}
                    </td>
                    <td className="py-3 px-2">
                      <PasswordCell row={row} />
                    </td>
                    <td className="py-3 px-2">{row.className || "—"}</td>
                    <td className="py-3 px-2">{row.section || "—"}</td>
                    <td className="py-3 pl-2 pr-4 font-mono text-xs">{row.admissionNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StudentCredentialsPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </>
  );
}
