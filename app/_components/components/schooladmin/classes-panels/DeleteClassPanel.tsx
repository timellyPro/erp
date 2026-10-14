"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { deleteClass } from "@/lib/api/classes";

type ClassRow = {
  id: string;
  name: string;
  section: string;
  students: number;
  teacher: string;
  subject: string;
};

interface DeleteClassPanelProps {
  row: ClassRow;
  onCancel: () => void;
  onConfirm?: () => void;
}

export default function DeleteClassPanel({
  row,
  onCancel,
  onConfirm,
}: DeleteClassPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const { ok, data } = await deleteClass(row.id);
      if (!ok) {
        setError(data?.message || "Failed to delete class.");
        return;
      }
      onConfirm?.();
    } catch {
      setError("Failed to delete class.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative bg-[#0F172A] p-4 shadow-inner animate-fadeIn border-y border-white/10">
      <div className="p-4 sm:p-5">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 sm:right-5 top-4 h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close delete confirmation"
        >
          <X size={16} className="mx-auto" />
        </button>

        <div className="flex flex-col items-center text-center text-white">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
            <AlertTriangle size={18} className="text-red-400" />
          </span>

          <h3 className="mt-2 text-base sm:text-lg font-semibold">
            Confirm Deletion
          </h3>
          <p className="mt-1.5 text-xs sm:text-sm text-white/60 max-w-xl">
            Do you really want to delete{" "}
            <span className="text-white font-semibold">
              {row.name} - {row.section}
            </span>
            ? This action cannot be undone and will remove all student associations.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 text-center">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 transition cursor-pointer text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-400 transition cursor-pointer text-sm"
          >
            {loading ? "Deleting..." : "Delete Class"}
          </button>
        </div>
      </div>
    </div>
  );
}
