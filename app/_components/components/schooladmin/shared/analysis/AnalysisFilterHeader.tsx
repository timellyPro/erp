import { ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import AnalysisSectionNav from "../../AnalysisSectionNav";

export function AnalysisFilterHeader({
  classId,
  onClassIdChange,
  classes,
  year,
  onYearChange,
  availableYears,
}: {
  classId: string;
  onClassIdChange: (v: string) => void;
  classes: { id: string; name: string; section: string | null }[];
  year: number;
  onYearChange: (v: number) => void;
  availableYears: number[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_28px_-10px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:mb-5 sm:rounded-2xl sm:p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">Analysis & Reports</h1>
          <p className="mt-0.5 text-sm text-white/60">Comprehensive insights into school performance</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          <div className="relative">
            <select
              value={classId}
              onChange={(e) => onClassIdChange(e.target.value)}
              className="
                appearance-none
                bg-black/40
                text-white
                px-4 py-2 pl-3 pr-8
                rounded-xl
                text-sm
                border border-white/10
                focus:outline-none
                focus:ring-1 focus:ring-white/20
                cursor-pointer
                min-w-[120px]
              "
            >
              <option value="" className="text-black">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id} className="text-black">
                  {c.name}{c.section ? ` ${c.section}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          </div>
          <div className="relative">
            <select
              value={
                year !== 0
                  ? year
                  : availableYears.length > 0
                  ? availableYears[0]
                  : ""
              }
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="
                appearance-none
                bg-black/40
                text-white
                px-6 py-2 pl-2
                rounded-xl
                text-sm
                border border-white/10
                focus:outline-none
                focus:ring-1 focus:ring-white/20
                cursor-pointer
                text-center
                min-w-[100px]
                sm:px-7
              "
            >
              {availableYears.map((y) => (
                <option key={y} value={y} className="text-black">
                  {y}-{y + 1}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <AnalysisSectionNav embedded />
      </div>
    </motion.div>
  );
}
