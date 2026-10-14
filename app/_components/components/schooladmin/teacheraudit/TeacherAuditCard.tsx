"use client";

import {
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  Award,
  Save
} from "lucide-react";
import type { TeacherRow, AuditRecord } from "./types";
import PerformanceHistory from "./PerformanceHistory";

const CATEGORY_MAP: Record<string, string> = {
  "Teaching Method": "TEACHING_METHOD",
  "Punctuality": "PUNCTUALITY",
  "Student Engagement": "STUDENT_ENGAGEMENT",
  "Innovation": "INNOVATION",
  "Extra Curricular": "EXTRA_CURRICULAR",
  "Results": "RESULTS",
};

const CATEGORY_LABEL_FROM_ENUM = (value: string) =>
  Object.keys(CATEGORY_MAP).find((k) => CATEGORY_MAP[k] === value) ?? value;

interface TeacherAuditCardProps {
  teacher: TeacherRow;
  isAddFormOpen: boolean;
  addFormMode: "good" | "bad";
  records: AuditRecord[];
  isHistoryOpen: boolean;
  category: string;
  customCategory: string;
  description: string;
  scoreImpact: number;
  saving: boolean;
  onCategoryChange: (v: string) => void;
  onCustomCategoryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onScoreImpactChange: (v: number) => void;
  onOpenAddGood: () => void;
  onOpenAddBad: () => void;
  onToggleHistory: () => void;
  onSaveRecord: () => void;
  onCloseAddForm: () => void;
}

export default function TeacherAuditCard({
  teacher,
  isAddFormOpen,
  addFormMode,
  records,
  isHistoryOpen,
  category,
  customCategory,
  description,
  scoreImpact,
  saving,
  onCategoryChange,
  onCustomCategoryChange,
  onDescriptionChange,
  onScoreImpactChange,
  onOpenAddGood,
  onOpenAddBad,
  onToggleHistory,
  onSaveRecord,
}: TeacherAuditCardProps) {

  // If the add form is open for this teacher, add the pending scoreImpact
const displayScore = Math.max(0, Math.min(100, teacher.performanceScore));
  const isScoreMaxed =
    (addFormMode === "good" && displayScore >= 100) ||
    (addFormMode === "bad" && displayScore <= 0);

  const categories = [
    "Teaching Method",
    "Punctuality",
    "Student Engagement",
    "Innovation",
    "Extra Curricular",
    "Results",
  ];

  const isFormReady = Boolean(category || customCategory.trim().length > 0);

  const getScoreColor = (s: number) => {
    if (s >= 90) return "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]";
    if (s >= 70) return "bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.6)]";
    if (s < 50) return "bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]";
    return "bg-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.5)]";
  };

  const barStyle = getScoreColor(displayScore);

  return (
    <div className="px-1 md:px-0 w-full">
      <div className="max-w-full mx-auto rounded-2xl border border-white/10 shadow-lg overflow-hidden bg-white/5 backdrop-blur-xl">
        
        {/* MAIN CARD HEADER */}
        {/* Changed lg: gap to xl: gap to give iPad Pro more breathing room */}
        <div className="px-4 py-6 sm:px-8 sm:py-6 border-b border-white/10">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 xl:gap-8">

            {/* LEFT SECTION: Profile & Name */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 xl:w-20 xl:h-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-xl">
                  {teacher.photoUrl ? (
                    <img
                      src={teacher.photoUrl}
                      alt={teacher.name || "Teacher"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/70 text-xl xl:text-2xl font-bold">
                      {teacher.name?.charAt(0) || "?"}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 xl:-bottom-2 xl:-right-2 w-6 h-6 xl:w-7 xl:h-7 rounded-full bg-[#1a1a1a] border border-white/20 flex items-center justify-center shadow-lg">
                  <Award className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-yellow-400" />
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-lg xl:text-xl font-bold text-white tracking-tight truncate">
                  {teacher.name ?? "-"}
                </h3>
                <p className="text-xs xl:text-sm text-white/50 font-medium truncate">
                  {teacher.subject ?? "-"}
                </p>
                <p className="text-[10px] xl:text-xs text-white/20 font-mono mt-0.5 truncate uppercase">
                  ID: {teacher.teacherId ?? "-"}
                </p>
              </div>
            </div>

            {/* RIGHT SECTION: Score & Actions */}
            <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-6 xl:gap-8">
              
              {/* SCORE SECTION */}
              <div className="flex items-center gap-4 w-full xl:w-auto">
                <div className="h-12 w-12 xl:h-14 xl:w-14 flex-shrink-0 rounded-xl xl:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className={`text-lg xl:text-xl font-bold transition-colors duration-500 ${
                    displayScore >= 90 ? "text-green-500" : 
                    displayScore >= 70 ? "text-lime-300" : 
                    displayScore < 50 ? "text-yellow-400" : "text-lime-500"
                  }`}>
                    {displayScore}
                  </span>
                </div>
                
                <div className="flex-1 xl:w-[180px]">
                  <p className="text-[10px] text-white lowercase tracking-widest mb-1">
                    Performance Score
                  </p>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-in-out ${barStyle}`}
                      style={{ width: `${displayScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] text-white/40 font-bold">{displayScore}/100</p>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              {/* Using xl: to ensure these stack on iPad Pro portrait but row on desktop */}
              <div className="flex flex-row flex-nowrap xl:flex-row gap-2 sm:gap-3 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                <button
                  onClick={onOpenAddGood}
                  className={`h-14 xl:h-16 px-3 xl:px-6 rounded-xl flex items-center justify-center gap-2 text-[10px] xl:text-sm font-bold transition-all flex-1 xl:flex-none whitespace-nowrap ${
                    isAddFormOpen && addFormMode === "good"
                      ? "bg-lime-400 text-black shadow-[0_0_15px_rgba(163,230,53,0.4)]"
                      : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                  }`}
                >
                  <ThumbsUp size={14} className="xl:w-4 xl:h-4" /> <span>Add Good</span>
                </button>

                <button
                  onClick={onOpenAddBad}
                  className={`h-14 xl:h-16 px-3 xl:px-6 rounded-xl flex items-center justify-center gap-2 text-[10px] xl:text-sm font-bold transition-all flex-1 xl:flex-none whitespace-nowrap ${
                    isAddFormOpen && addFormMode === "bad"
                      ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                      : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                  }`}
                >
                  <ThumbsDown size={14} className="xl:w-4 xl:h-4" /> <span>Add Bad</span>
                </button>

                <button
                  onClick={onToggleHistory}
                  className="h-14 xl:h-16 px-3 xl:px-6 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center gap-2 font-bold flex-1 xl:flex-none hover:bg-white/20 transition-all whitespace-nowrap"
                >
                  <span className="text-[10px] xl:text-sm">View All</span>
                  {isHistoryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* ADD FORM SECTION */}
          {isAddFormOpen && (
            <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 px-3 py-6 xl:p-9 backdrop-blur-lg">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                {/* LEFT: Category Selection */}
                <div className="space-y-4">
                  <h4 className={`text-xs xl:text-sm font-semibold flex items-center gap-2 uppercase tracking-wider ${
                    addFormMode === "good" ? "text-lime-400" : "text-red-400"
                  }`}>
                    {addFormMode === "good" ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
                    ADD {addFormMode === "good" ? "POSITIVE" : "NEGATIVE"} RECORD
                  </h4>

                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const enumValue = CATEGORY_MAP[c];
                      const isSelected = category === enumValue;
                      return (
                        <button
                          key={c}
                          onClick={() => { onCategoryChange(enumValue); onCustomCategoryChange(""); }}
                          className={`px-3 py-1.5 rounded-full text-[10px] xl:text-xs border transition-all ${
                            isSelected
                              ? addFormMode === "good" ? "bg-lime-400 text-black border-lime-400" : "bg-red-500 text-white border-red-500"
                              : "border-white/20 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT: Input Fields */}
                <div className="xl:col-span-2 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-white/40 font-medium ml-1">Category</label>
                      <input
                        value={customCategory || CATEGORY_LABEL_FROM_ENUM(category)}
                        onChange={(e) => { onCustomCategoryChange(e.target.value); onCategoryChange(""); }}
                        placeholder="Category..."
                        className="w-full h-11 rounded-xl bg-black/20 px-4 text-sm text-white border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/30 transition"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-white/40 font-medium ml-1">Details (Optional)</label>
                      <input
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        placeholder="Description..."
                        className="w-full h-11 rounded-xl bg-black/20 px-4 text-sm text-white border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/30 transition"
                      />
                    </div>
                  </div>

                  {/* SLIDER */}
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] text-white/40 font-medium ml-1">Score Impact</label>
                      <span className={`text-base font-bold ${addFormMode === "good" ? "text-lime-400" : "text-red-500"}`}>
                        {addFormMode === "good" ? "+" : "-"}{Math.abs(scoreImpact)}
                      </span>
                    </div>
                    <div className="relative flex items-center h-2">
                      <input
                        type="range" min={0} max={50} step={5}
                        disabled={isScoreMaxed}
                        value={Math.abs(scoreImpact)}
                        onChange={(e) => onScoreImpactChange(addFormMode === "good" ? Number(e.target.value) : -Number(e.target.value))}
                        style={{
                          background: `linear-gradient(to right, ${addFormMode === "good" ? "#a3e635" : "#ef4444"} 0%, ${addFormMode === "good" ? "#a3e635" : "#ef4444"} ${(Math.abs(scoreImpact) / 50) * 100}%, rgba(255, 255, 255, 0.1) ${(Math.abs(scoreImpact) / 50) * 100}%, rgba(255, 255, 255, 0.1) 100%)`,
                        }}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                    </div>
                  </div>

                  {/* SAVE BUTTON */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={saving || !isFormReady}
                      onClick={onSaveRecord}
                      className={`w-full xl:w-auto h-12 px-10 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all ${
                        isFormReady
                          ? "bg-[#A3E635] text-black shadow-[0_8px_20px_rgba(163,230,53,0.3)] hover:scale-[1.02] active:scale-[0.98]"
                          : "bg-white/10 text-white/30"
                      }`}
                    >
                      <Save size={18} />
                      <span>{saving ? "Saving..." : "Save Record"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isHistoryOpen && (
            <div className="mt-4 overflow-x-auto">
              <PerformanceHistory records={records} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}