"use client";

import { Filter, ChevronDown } from "lucide-react";

type FilterOption = {
  label: string;
  value: string;
};

type FilterItem = {
  key: string;
  placeholder: string;
  options: FilterOption[];
};

interface FilterBarProps {
  filters: FilterItem[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
}

export default function FilterBar({
  filters,
  filterValues,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="relative w-full">
      {filters.map((filter) => (
        <div key={filter.key} className="relative">

          {/* Left Icon */}
          <Filter
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60"
          />

          {/* Dropdown Arrow */}
          <ChevronDown
            size={16}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none"
          />

          <select
            value={filterValues[filter.key] ?? ""}
            onChange={(e) =>
              onFilterChange(filter.key, e.target.value)
            }
            className="
              w-full pl-10 pr-10 py-3
              rounded-2xl
              text-sm
              text-white
              bg-black/30
              border border-white/20
              focus:outline-none
              focus:border-lime-400/60
              appearance-none
              cursor-pointer
              transition
            "
          >
            <option value="">{filter.placeholder}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="text-white bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
