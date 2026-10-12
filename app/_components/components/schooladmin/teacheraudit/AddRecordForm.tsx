"use client";

import { ThumbsUp, ThumbsDown, Save } from "lucide-react";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_OPTIONS } from "./types";

interface AddRecordFormProps {
  mode: "good" | "bad";
  category: string;
  customCategory: string;
  description: string;
  scoreImpact: number;
  saving: boolean;
  onCategoryChange: (v: string) => void;
  onCustomCategoryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onScoreImpactChange: (v: number) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function AddRecordForm({
  mode,
  category,
  customCategory,
  description,
  scoreImpact,
  saving,
  onCategoryChange,
  onCustomCategoryChange,
  onDescriptionChange,
  onScoreImpactChange,
  onSave,
  onClose,
}: AddRecordFormProps) {
  const isPositive = mode === "good";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4
          className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
            isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? (
            <>
              <ThumbsUp className="w-4 h-4 flex-shrink-0" />
              Add Positive Record
            </>
          ) : (
            <>
              <ThumbsDown className="w-4 h-4 flex-shrink-0" />
              Add Negative Record
            </>
          )}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-white/60 hover:text-white text-sm py-1 px-2 -m-2 touch-manipulation"
        >
          Close
        </button>
      </div>

      <div>
        <p className="text-xs text-white/60 mb-2">Category Suggestions</p>
        <div className="flex flex-wrap gap-2">
          {AUDIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCategoryChange(c.id)}
              className={`px-3 py-1.5 sm:py-2 rounded-lg text-sm border transition touch-manipulation min-h-[44px] sm:min-h-0 ${
                category === c.id
                  ? "bg-white/20 border-white/30 text-white"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-white/70 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 sm:py-3 text-white text-sm border border-white/10 bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/20"
          >
            {AUDIT_CATEGORY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id} className="bg-gray-900">
                {c.label}
              </option>
            ))}
          </select>
          {category === "CUSTOM" && (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => onCustomCategoryChange(e.target.value)}
              placeholder="Type or select a category..."
              className="mt-2 w-full rounded-xl px-3 py-2.5 text-white text-sm border border-white/10 bg-white/5 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          )}
        </div>
        <div>
          <label className="block text-xs text-white/70 mb-1.5">Details</label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Add a short description..."
            rows={3}
            className="w-full rounded-xl px-3 py-2.5 text-white text-sm border border-white/10 bg-white/5 placeholder:text-white/40 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-white/70">Score Impact</label>
          <span
            className={`text-sm font-semibold ${
              scoreImpact >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {scoreImpact >= 0 ? `+${scoreImpact}` : scoreImpact}
          </span>
        </div>
        <input
          type="range"
          min={-50}
          max={50}
          value={scoreImpact}
          onChange={(e) => onScoreImpactChange(Number(e.target.value))}
          className="w-full h-3 sm:h-2 rounded-full appearance-none bg-white/10 accent-emerald-500 touch-manipulation"
        />
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving || !description.trim()}
        className="inline-flex items-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm disabled:opacity-50 transition w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0 touch-manipulation"
      >
        <Save className="w-4 h-4 flex-shrink-0" />
        {saving ? "Saving..." : "Save Record"}
      </button>
    </div>
  );
}
