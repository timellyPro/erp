import { CheckCircle2, Plus, Trash2 } from "lucide-react";

type Unit = { id: number; unitId?: string; name: string; status: string; completion: number };

export function SyllabusUnitsPanel({
  units,
  onUnitsChange,
  onAddUnit,
  onRemoveUnit,
}: {
  units: Unit[];
  onUnitsChange: (units: Unit[]) => void;
  onAddUnit: () => void;
  onRemoveUnit: (id: number) => void;
}) {
  return (
    <div className="lg:col-span-8 bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-[1rem] flex flex-col overflow-hidden shadow-2xl">
      {/* Header Section */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><CheckCircle2 className="text-lime-400" />Syllabus & Coverage</h2>
        </div>
        <button
          type="button"
          onClick={onAddUnit}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold
          rounded-lg transition-all text-lime-400 hover:text-white flex items-center gap-1.5"
        >
          <Plus /> Add Unit
        </button>
      </div>

      {/* Units Content */}
      <div className="lg:col-span-2 rounded-2xl flex flex-col h-full overflow-hidden">
        {units.length === 0 ? (
          <p className="text-white/40 text-sm py-6 text-center">No syllabus units yet.</p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
              {units.map((unit, idx) => (
                <div
                  key={unit.id}
                  className="bg-white/5 border border-white/5 rounded-xl p-4 animate-fadeIn"
                >
                  <div className="flex items-start gap-4 mb-4">
                    {/* Number Badge */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-gray-400 text-xs font-bold shrink-0 border border-white/10">
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-4 lg:mb-2 gap-4">
                        <div>
                          <input
                            value={unit.name}
                            onChange={(e) => {
                              const newUnits = [...units];
                              newUnits[idx].name = e.target.value;
                              onUnitsChange(newUnits);
                            }}
                            placeholder="Unit / Topic Name"
                            className="w-full bg-transparent border-none p-0 text-white font-medium
                             focus:outline-none placeholder-gray-600 focus:placeholder-gray-400 transition-all"
                          />
                          <div className="h-px bg-white/10 w-full mt-2"></div>
                        </div>

                        {/* Fixed Remove Button: propagation stop ensures it clicks while scrolling */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveUnit(unit.id);
                          }}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-4 h-5"/>
                        </button>
                      </div>

                      <div className="flex flex-col xl:flex-row items-start xl:items-center gap-6 xl:gap-8">
                        {/* Status Selection */}
                        <div className="shrink-0 z-10 w-full lg:w-auto">
                          <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Status</label>
                          <div className="flex p-1 rounded-xl border border-white/5 bg-black/20 lg:bg-transparent inline-flex">
                            {["Pending", "Partial", "Completed"].map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => {
                                  const newUnits = [...units];
                                  newUnits[idx].status = status;
                                  if (status === "Completed") newUnits[idx].completion = 100;
                                  if (status === "Pending") newUnits[idx].completion = 0;
                                  onUnitsChange(newUnits);
                                }}
                                className={`px-3 lg:px-4 py-2 rounded-lg text-[10px] lg:text-[11px]  transition-all whitespace-nowrap ${
                                  unit.status === status
                                    ? status === "Completed" ? "bg-[#b4ff39] text-black shadow-lg" : status === "Partial" ? "bg-yellow-400 text-black" : "bg-red-500 text-white"
                                    : "text-white/30 hover:text-white/60 hover:bg-white/5"
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Progress Slider */}
                        <div className="flex-1 w-full mt-2 lg:mt-0">
                          <div className="flex justify-between items-center mb-2 px-1">
                            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Completion %</label>
                            <span className="text-sm text-[#b4ff39]">{unit.completion}%</span>
                          </div>
                          <div className="relative h-6 flex items-center group">
                            <div className="h-2 w-full bg-white/5 rounded-full relative">
                              <div
                                className="h-full bg-[#b4ff39] rounded-full shadow-[0_0_15px_rgba(180,255,57,0.5)] transition-all duration-300"
                                style={{ width: `${unit.completion}%` }}
                              />
                              <div
                                className="absolute top-1/2 h-4 w-4 bg-[#b4ff39] border-[3px] border-[#1e162e] rounded-full shadow-lg -translate-y-1/2 -translate-x-1/2 z-20"
                                style={{ left: `${unit.completion}%` }}
                              />
                            </div>
                            <input
                              type="range"
                              min="0" max="100" step="5"
                              value={unit.completion}
                              onChange={(e) => {
                                const newUnits = [...units];
                                const val = parseInt(e.target.value);
                                newUnits[idx].completion = val;
                                if (val === 100) newUnits[idx].status = "Completed";
                                else if (val > 0) newUnits[idx].status = "Partial";
                                else newUnits[idx].status = "Pending";
                                onUnitsChange(newUnits);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile-only Scroll Indicator Symbol */}
            <div className="flex lg:hidden justify-center items-center gap-1.5 mt-2">
              <div className="w-8 h-1 bg-[#b4ff39]/40 rounded-full overflow-hidden">
                <div className="w-1/2 h-full bg-[#b4ff39] rounded-full animate-pulse"></div>
              </div>
              <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Swipe</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
