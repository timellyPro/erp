import type React from "react";
import { Search } from "lucide-react";
import SearchInput from "../../SearchInput";

export function AppHeaderMobileSearch({
  searchQuery,
  onChange,
  onKeyDown,
  onSubmit,
  onClose,
}: {
  searchQuery: string;
  onChange: (query: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start p-4 md:hidden">
      <div className="w-full bg-neutral-900 rounded-xl p-4">
        <SearchInput
          icon={Search}
          showSearchIcon
          value={searchQuery}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Search..."
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-lime-400 text-black rounded-lg text-sm font-medium"
          >
            Search
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
