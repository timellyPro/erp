import { Calendar, BookOpen, Activity, Clock } from "lucide-react";
import type { StudentDetail } from "./types";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";

export function ProfileStatCards({
  detail,
  feeBreakdown,
}: {
  detail: StudentDetail;
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
}) {
  const due = feeBreakdown?.remainingFee ?? detail.fee?.remainingFee ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="p-2 bg-lime-400/10 rounded-xl flex-shrink-0">
          <Calendar className="w-5 h-5 sm:w-5 sm:h-5 text-lime-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-500">Attendance</p>
          <p className="text-base sm:text-lg font-bold text-white truncate">
            {detail.attendanceTrends.length
              ? `${Math.round(detail.attendanceTrends.reduce((a, t) => a + t.pct, 0) / detail.attendanceTrends.length)}%`
              : "-"}
          </p>
          <p className="text-[10px] text-lime-400">Avg this year</p>
        </div>
      </div>
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="p-2 text-white rounded-xl flex-shrink-0">
          <BookOpen className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Grade</p>
          <p className="text-lg font-bold text-white">
            {detail.academicPerformance.length ? "A" : "-"}
          </p>
          <p className="text-[10px] text-blue-400">Academic Rank: —</p>
        </div>
      </div>
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="p-2 bg-pink-400/10 rounded-xl flex-shrink-0">
          <Activity className="w-5 h-5 text-pink-400" />
        </div>
        <div>
          <p className="text-xs text-gray-500">Behavior</p>
          <p className="text-lg font-bold text-pink-400">—</p>
          <p className="text-[10px] text-pink-400">—</p>
        </div>
      </div>
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="p-2 bg-amber-400/10 rounded-xl flex-shrink-0">
          <Clock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-xs text-gray-500">Fees Due</p>
          <p className="text-lg font-bold text-lime-400">
            {due > 0 ? `₹${due.toLocaleString()}` : "₹0"}
          </p>
          <p className="text-[10px] text-lime-400">{due <= 0 ? "All Cleared" : "Pending"}</p>
        </div>
      </div>
    </div>
  );
}
