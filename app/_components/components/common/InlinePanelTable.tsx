"use client";

import { Fragment, ReactNode } from "react";
import { Column } from "../../types/superadmin";

type InlinePanelTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
  rowKey?: (row: T, index: number) => string | number;
  activeRowId?: string | number | null;
  panelKey?: string | null;
  renderPanel?: (row: T) => ReactNode;
};

const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export default function InlinePanelTable<T>({
  columns,
  data,
  emptyText = "No data found",
  rowKey,
  activeRowId,
  panelKey,
  renderPanel,
}: InlinePanelTableProps<T>) {
  const getKey = (row: T, index: number) => {
    if (rowKey) return rowKey(row, index);
    const id = (row as { id?: string | number })?.id;
    if (id) return id;
    return `row-${index}`;
  };

  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead className="bg-white/5 border-b border-white/10">
        <tr>
          {columns.map((col, i) => (
            <th
              key={i}
              scope="col"
              className={`px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider ${ALIGN_CLASS[col.align ?? "left"]}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {data.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="px-6 py-8 text-center text-white/60">
              {emptyText}
            </td>
          </tr>
        )}
        {data.map((row, rowIndex) => {
          const key = getKey(row, rowIndex);
          const showPanel = renderPanel && activeRowId != null && key === activeRowId;
          return (
            <Fragment key={key}>
              <tr className="hover:bg-white/5 transition-colors">
                {columns.map((col, colIndex) => (
                  <td
                    key={colIndex}
                    className={`px-6 py-4 whitespace-nowrap ${ALIGN_CLASS[col.align ?? "left"]}`}
                  >
                    {col.render ? col.render(row, rowIndex) : null}
                  </td>
                ))}
              </tr>

              {showPanel && (
                <tr key={`${key}-${panelKey ?? "panel"}`}>
                  <td colSpan={columns.length} className="p-0">
                    {renderPanel?.(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
