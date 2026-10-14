"use client";

import { ReactNode } from "react";

interface ResponsiveTableProps {
  /** Table header cells (th) */
  headers: { key: string; label: string; className?: string; hideOnMobile?: boolean }[];
  /** Table body rows: array of cells per row, each cell is ReactNode */
  rows: ReactNode[][];
  /** Optional empty state message */
  emptyMessage?: string;
  /** Optional footer slot below table */
  footer?: ReactNode;
  /** Optional wrapper class for the scroll container */
  className?: string;
}

/**
 * Responsive table: horizontal scroll on small screens, aligned columns.
 * Use with consistent column count matching headers length.
 */
export default function ResponsiveTable({
  headers,
  rows,
  emptyMessage = "No data",
  footer,
  className = "",
}: ResponsiveTableProps) {
  const colCount = headers.length;

  return (
    <div className={`rounded-xl border border-white/10 overflow-hidden bg-white/5 ${className}`}>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-white/10">
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`text-left px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold text-white/80 whitespace-nowrap ${h.hideOnMobile ? "hidden sm:table-cell" : ""} ${h.className ?? ""}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-sm text-white/60"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-white/10 hover:bg-white/5 transition"
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`px-3 sm:px-4 py-3 text-xs sm:text-sm text-white/90 ${headers[cellIdx]?.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="px-3 sm:px-4 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-white/60">
          {footer}
        </div>
      )}
    </div>
  );
}
