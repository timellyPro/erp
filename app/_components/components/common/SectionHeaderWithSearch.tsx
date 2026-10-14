"use client";

import { ReactNode } from "react";
import { Search } from "lucide-react";
import SearchInput from "./SearchInput";

type SectionHeaderWithSearchProps = {
  title: string;
  subtitle?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  rightSlot?: ReactNode;
  className?: string;
  searchWidthClassName?: string;
  searchInputClassName?: string;
};

export default function SectionHeaderWithSearch({
  title,
  subtitle,
  searchValue = "",
  onSearch,
  searchPlaceholder = "Search...",
  showSearch = true,
  rightSlot,
  className = "",
  searchWidthClassName = "md:w-[280px]",
  searchInputClassName = "",
}: SectionHeaderWithSearchProps) {
  const shouldShowSearch = showSearch && typeof onSearch === "function";

  return (
    <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${className}`}>
      <div>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {rightSlot}
        {shouldShowSearch && (
          <div className={`w-full ${searchWidthClassName}`}>
            <SearchInput
              value={searchValue}
              onChange={onSearch}
              placeholder={searchPlaceholder}
              variant="glass"
              icon={Search}
              inputClassName={searchInputClassName}
            />
          </div>
        )}
      </div>
    </div>
  );
}
