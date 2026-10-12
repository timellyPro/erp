"use client";

import { Trash2, X } from "lucide-react";

interface DeleteEventModalProps {
  open: boolean;
  title?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteEventModal({
  open,
  title,
  loading,
  onCancel,
  onConfirm,
}: DeleteEventModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-2xl px-6 py-5 shadow-2xl relative animate-fadeIn">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-white/60 hover:text-white transition cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center justify-center">
          <span className="h-12 w-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
            <Trash2 size={20} />
          </span>
        </div>

        <h3 className="mt-4 text-center text-lg font-semibold text-white">
          Delete Event?
        </h3>
        <p className="mt-2 text-center text-sm text-white/60">
          Do you really want to delete{" "}
          <span className="text-white font-semibold">
            {title || "this event"}
          </span>
          ? This action cannot be undone.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="min-w-[140px] rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 hover:bg-red-400 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
