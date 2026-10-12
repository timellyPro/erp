"use client";

import { UserCheck, UserX, Users } from "lucide-react";
import StatCard from "../../common/statCard";

type Props = {
  showing: number;
  totalCount: number | null;
  activeCount: number | null;
  inactiveCount: number | null;
  statusFilter: "active" | "inactive" | "all";
};

export default function StudentStats({
  showing,
  totalCount,
  activeCount,
  inactiveCount,
  statusFilter,
}: Props) {
  const filterLabel =
    statusFilter === "inactive"
      ? "Inactive"
      : statusFilter === "all"
        ? "All"
        : "Active";

  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <StatCard className="bg-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-xl bg-lime-400/10">
            <Users className="w-5 h-5 text-lime-400" />
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-lime-400/10 text-lime-300 border border-lime-400/20">
            {filterLabel}
          </span>
        </div>
        <h3 className="text-xs sm:text-sm font-medium text-gray-400">Showing</h3>
        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
          {showing.toLocaleString()}
          {totalCount != null ? (
            <span className="text-base font-medium text-white/50">
              {" "}
              / {totalCount.toLocaleString()}
            </span>
          ) : null}
        </p>
        <p className="text-[11px] text-white/60 mt-1">In current filter</p>
      </StatCard>

      <StatCard className="bg-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-xl bg-lime-400/10">
            <UserCheck className="w-5 h-5 text-lime-400" />
          </div>
        </div>
        <h3 className="text-xs sm:text-sm font-medium text-gray-400">Active</h3>
        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
          {activeCount != null ? activeCount.toLocaleString() : "—"}
        </p>
        <p className="text-[11px] text-white/60 mt-1">Can access the portal</p>
      </StatCard>

      <StatCard className="bg-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-xl bg-red-400/10">
            <UserX className="w-5 h-5 text-red-300" />
          </div>
        </div>
        <h3 className="text-xs sm:text-sm font-medium text-gray-400">Inactive</h3>
        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
          {inactiveCount != null ? inactiveCount.toLocaleString() : "—"}
        </p>
        <p className="text-[11px] text-white/60 mt-1">No portal access</p>
      </StatCard>
    </section>
  );
}
