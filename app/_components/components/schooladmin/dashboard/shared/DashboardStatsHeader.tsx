import { Users, GraduationCap, UserCheck, Wallet } from "lucide-react";
import { StatCard } from "../../dashboard/components/StatCard";
import { CollectionStatCard } from "../components/CollectionStatCard";
import type { SchoolDashboardPayload } from "@/lib/school/loadSchoolDashboard";

const formatChange = (n: number) => (n >= 0 ? `+${n} this month` : `${n} this month`);

export function DashboardStatsHeader({
  userName,
  data,
  isInitialLoading,
  selectedCollectionTo,
  onDateChange,
  collectionCash,
  collectionOnline,
  collectionLoading,
}: {
  userName: string;
  data: SchoolDashboardPayload | null;
  isInitialLoading: boolean;
  selectedCollectionTo: string;
  onDateChange: (dateYmd: string) => void;
  collectionCash: { key: string; label: string; amount: number; formattedAmount: string; count: number };
  collectionOnline: { key: string; label: string; amount: number; formattedAmount: string; count: number };
  collectionLoading: boolean;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-6 mb-6 md:mb-10 bg-gradient-to-br from-white/5 to-transparent border border-white/10">
      <div className="min-w-0 mb-4 sm:mb-5">
        <h2 className="text-2xl sm:text-4xl md:text-2xl font-black text-white mb-2 md:mb-3">
          Welcome back, {userName}! 👋
        </h2>
        <p className="text-gray-400 text-sm sm:text-base md:text-md font-medium">
          Here&apos;s what&apos;s happening in your school today.
        </p>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3 ${isInitialLoading ? "animate-pulse" : ""}`}
      >
        <StatCard
          label="Total Classes"
          value={isInitialLoading ? "…" : String(data?.stats.totalClasses ?? "—")}
          trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalClassesChange) : "—"}
          Icon={Users}
        />
        <StatCard
          label="Total Students"
          value={isInitialLoading ? "…" : data ? data.stats.totalStudents.toLocaleString() : "—"}
          trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalStudentsChange) : "—"}
          Icon={GraduationCap}
        />
        <StatCard
          label="Total Teachers"
          value={isInitialLoading ? "…" : String(data?.stats.totalTeachers ?? "—")}
          trend={isInitialLoading ? "Loading" : data ? formatChange(data.stats.totalTeachersChange) : "—"}
          Icon={UserCheck}
        />
        <StatCard
          label="Fees Collected"
          value={isInitialLoading ? "…" : data?.stats.feesCollected ?? "—"}
          trend={isInitialLoading ? "Loading" : data ? `${data.stats.feesCollectedPct}% collected` : "—"}
          trendColor="text-lime-400"
          Icon={Wallet}
        />
        <CollectionStatCard
          selectedDate={selectedCollectionTo}
          onDateChange={onDateChange}
          totalFormatted={isInitialLoading ? "…" : data?.stats.todayCollectionTotal ?? "₹0"}
          cash={collectionCash}
          online={collectionOnline}
          loading={collectionLoading || isInitialLoading}
        />
      </div>
    </div>
  );
}
