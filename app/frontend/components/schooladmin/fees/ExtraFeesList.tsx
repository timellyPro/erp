"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { ExtraFee } from "./types";
import { schoolAdminStudentDetailsFeesUrl } from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";

const PAGE_SIZE = 15;

interface ExtraFeesListProps {
  extraFees: ExtraFee[];
  classes: Array<{ id: string; name: string; section: string | null }>;
  students: Array<{ id: string; user: { name: string | null }; admissionNumber: string }>;
  onSuccess: () => void;
}

function residencyLabel(scope: string | null | undefined): string {
  const s = (scope ?? "ALL").toUpperCase();
  if (s === "HOSTELLER") return "Hostel only";
  if (s === "DAY_SCHOLAR") return "Day scholars only";
  return "All students";
}

function targetLabel(
  ef: ExtraFee,
  classes: Array<{ id: string; name: string; section: string | null }>,
  students: Array<{ id: string; user: { name: string | null }; admissionNumber: string }>
) {
  if (ef.targetType === "SCHOOL") return "Entire School";
  if (ef.targetType === "CLASS" && ef.targetClassId) {
    const c = classes.find((x) => x.id === ef.targetClassId);
    return c ? `Class ${c.name}${c.section ? `-${c.section}` : ""}` : "Class";
  }
  if (ef.targetType === "SECTION" && ef.targetClassId && ef.targetSection) {
    const c = classes.find((x) => x.id === ef.targetClassId);
    return c ? `Section ${c.name}-${ef.targetSection}` : "Section";
  }
  if (ef.targetType === "STUDENT" && ef.targetStudentId) {
    const s = students.find((x) => x.id === ef.targetStudentId);
    return s ? s.user?.name || s.admissionNumber : "Student";
  }
  return "-";
}

export default function ExtraFeesList({
  extraFees,
  classes,
  students,
  onSuccess,
}: ExtraFeesListProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editSplitIntoTwoInstallments, setEditSplitIntoTwoInstallments] = useState(false);

  const startEdit = (ef: ExtraFee) => {
    setEditingId(ef.id);
    setEditName(ef.name);
    setEditAmount(String(ef.amount));
    setEditSplitIntoTwoInstallments(Boolean(ef.splitIntoTwoInstallments));
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim() || !editAmount || Number(editAmount) <= 0)
      return;
    try {
      const res = await fetch(`/api/fees/extra/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          amount: Number(editAmount),
          splitIntoTwoInstallments: editSplitIntoTwoInstallments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to update");
        return;
      }
      setEditingId(null);
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Failed to update");
    }
  };

  const handleDelete = async (ef: ExtraFee) => {
    if (!confirm(`Do you really want to delete "${ef.name}"? Student amounts will be recalculated. This action cannot be undone.`))
      return;
    try {
      const res = await fetch(`/api/fees/extra/${ef.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to delete");
        return;
      }
      setEditingId(null);
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Failed to delete");
    }
  };

  const totalPages = Math.max(1, Math.ceil(extraFees.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => extraFees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [extraFees, page]
  );

  useEffect(() => {
    setPage(1);
  }, [extraFees.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (extraFees.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4">
        {`All Extra Fees (${extraFees.length}${
          extraFees.length > PAGE_SIZE
            ? ` · rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, extraFees.length)}`
            : ""
        })`}
      </h3>
      <div className="space-y-3 sm:hidden">
        {pageRows.map((ef) => (
          <div key={ef.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {editingId === ef.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <div className="break-words text-white">
                    {ef.name}
                    {ef.splitIntoTwoInstallments ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-sky-300">2 inst.</span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                {editingId === ef.id ? (
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <span className="text-white">₹{ef.amount.toLocaleString()}</span>
                )}
              </div>
            </div>
            <div
              className={`mt-3 text-sm text-gray-400 ${
                ef.targetType === "STUDENT" && ef.targetStudentId
                  ? "cursor-pointer select-none underline-offset-2 hover:text-gray-200 hover:underline"
                  : ""
              }`}
              onMouseEnter={() => {
                if (ef.targetType === "STUDENT" && ef.targetStudentId) {
                  router.prefetch(schoolAdminStudentDetailsFeesUrl(ef.targetStudentId));
                }
              }}
              onClick={() => {
                if (ef.targetType === "STUDENT" && ef.targetStudentId) {
                  router.push(schoolAdminStudentDetailsFeesUrl(ef.targetStudentId));
                }
              }}
            >
              Applies to: {targetLabel(ef, classes, students)}
              <span className="block mt-1 text-xs text-white/50">Residency: {residencyLabel(ef.residencyScope)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {editingId === ef.id ? (
                <>
                  <label className="flex w-full cursor-pointer items-center gap-2 text-[11px] text-white/70">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-white/20 bg-black/40"
                      checked={editSplitIntoTwoInstallments}
                      onChange={(e) => setEditSplitIntoTwoInstallments(e.target.checked)}
                    />
                    Two installments (50/50) on breakdown
                  </label>
                  <button
                    type="button"
                    onClick={handleUpdate}
                    className="rounded-lg bg-lime-500/20 px-3 py-1.5 text-xs text-lime-400 hover:bg-lime-500/30"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(ef)}
                    className="rounded-lg p-2 hover:bg-white/10"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ef)}
                    className="rounded-lg p-2 text-red-400 hover:bg-red-500/20"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
        <table className="min-w-[560px] w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-white/10">
              <th className="py-3">Name</th>
              <th className="py-3">Amount</th>
              <th className="py-3">Applies To</th>
              <th className="py-3">Residency</th>
              <th className="py-3 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((ef) => (
              <tr key={ef.id} className="border-b border-white/5">
                <td className="py-3">
                  {editingId === ef.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-sm w-full max-w-[180px]"
                      />
                      <label className="flex cursor-pointer items-center gap-2 text-[10px] text-white/60">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-white/20 bg-black/40"
                          checked={editSplitIntoTwoInstallments}
                          onChange={(e) => setEditSplitIntoTwoInstallments(e.target.checked)}
                        />
                        2 installments
                      </label>
                    </div>
                  ) : (
                    <span className="text-white">
                      {ef.name}
                      {ef.splitIntoTwoInstallments ? (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-sky-300">2 inst.</span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="py-3">
                  {editingId === ef.id ? (
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-sm w-24"
                    />
                  ) : (
                    <span className="text-white">₹{ef.amount.toLocaleString()}</span>
                  )}
                </td>
                <td
                  className={`py-3 text-gray-400 ${
                    ef.targetType === "STUDENT" && ef.targetStudentId
                      ? "cursor-pointer select-none underline-offset-2 hover:underline hover:text-gray-200"
                      : ""
                  }`}
                  title={
                    ef.targetType === "STUDENT" && ef.targetStudentId
                      ? "Double-click to open student fee details"
                      : undefined
                  }
                  onMouseEnter={() => {
                    if (ef.targetType === "STUDENT" && ef.targetStudentId) {
                      router.prefetch(schoolAdminStudentDetailsFeesUrl(ef.targetStudentId));
                    }
                  }}
                  onDoubleClick={() => {
                    if (ef.targetType === "STUDENT" && ef.targetStudentId) {
                      router.push(schoolAdminStudentDetailsFeesUrl(ef.targetStudentId));
                    }
                  }}
                >
                  {targetLabel(ef, classes, students)}
                </td>
                <td className="py-3 text-gray-400">{residencyLabel(ef.residencyScope)}</td>
                <td className="py-3">
                  {editingId === ef.id ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleUpdate}
                        className="px-2 py-1 rounded-lg bg-lime-500/20 text-lime-400 text-xs hover:bg-lime-500/30"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 rounded-lg border border-white/20 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(ef)}
                        className="p-1.5 rounded-lg hover:bg-white/10"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ef)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </section>
  );
}
