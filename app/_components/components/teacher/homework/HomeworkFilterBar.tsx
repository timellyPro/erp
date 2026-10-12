"use client";

import { Search } from "lucide-react";
import type { HomeworkFilter } from "./types";

type Props = {
  filter: HomeworkFilter;
  setFilter: (f: HomeworkFilter) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
};

export default function HomeworkFilterBar({
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
}: Props) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 md:p-4 mb-6 flex flex-col lg:flex-row justify-between items-center gap-4">
      <div className="flex bg-black/20 p-1 rounded-full border border-white/5 w-full lg:w-auto overflow-x-auto no-scrollbar">
        {(["all", "active", "closed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 lg:flex-none px-6 md:px-8 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-semibold transition-all duration-200 whitespace-nowrap border border-transparent ${
              filter === f
                ? "bg-white/10 text-white shadow-inner border-lime-400/20"
                : "text-white/40 hover:text-white hover:border-lime-400/30 hover:bg-gradient-to-b hover:from-lime-400/5 hover:via-lime-400/15 hover:to-lime-400/5"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      

      <div className="relative w-full lg:w-80">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assignments..."
          className="w-full bg-black/30 border border-white/10 rounded-full py-3 pl-12 pr-6 text-sm focus:outline-none focus:border-lime-400/50 transition-colors text-white placeholder:text-white/50"
        />
      </div>
    </div>
  );
}
