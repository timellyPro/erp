import { Check, Loader2, Search } from "lucide-react";

export function ClassSectionPicker({
  selectMode,
  selectedKeys,
  classSearch,
  onClassSearchChange,
  allVisibleSelected,
  onSelectAllVisible,
  classesLoading,
  filteredOptions,
  onToggleKey,
}: {
  selectMode: "class" | "section";
  selectedKeys: Set<string>;
  classSearch: string;
  onClassSearchChange: (v: string) => void;
  allVisibleSelected: boolean;
  onSelectAllVisible: () => void;
  classesLoading: boolean;
  filteredOptions: { key: string; label: string; hint: string | null }[];
  onToggleKey: (key: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <label className="text-xs font-medium text-white/60">
          {selectMode === "class" ? "CLASSES" : "SECTIONS"}{" "}
          <span className="text-lime-400">({selectedKeys.size} selected)</span>
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={classSearch}
              onChange={(e) => onClassSearchChange(e.target.value)}
              placeholder={selectMode === "class" ? "Search class…" : "Search section…"}
              className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-lime-400/50"
            />
          </div>
          <button
            type="button"
            onClick={onSelectAllVisible}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 whitespace-nowrap"
          >
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </button>
        </div>
      </div>

      {classesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-lime-400" size={24} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto no-scrollbar p-1">
          {filteredOptions.map((o) => {
            const on = selectedKeys.has(o.key);
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onToggleKey(o.key)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm border transition ${
                  on
                    ? "bg-lime-400/15 border-lime-400/40 text-lime-200"
                    : "bg-black/30 border-white/10 text-white/70 hover:border-white/20"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border shrink-0 ${
                    on ? "bg-lime-400 border-lime-400 text-black" : "border-white/20"
                  }`}
                >
                  {on ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.label}</span>
                  {o.hint ? (
                    <span className="block text-[10px] text-white/40 truncate">{o.hint}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <p className="col-span-full text-sm text-white/40 py-4 text-center">
              No classes found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
