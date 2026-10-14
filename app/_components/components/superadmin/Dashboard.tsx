"use client";

import { useEffect, useState } from "react";
import PageHeader from "../common/PageHeader";

import { Users, School, GraduationCap } from "lucide-react";
import { formatNumber as fmtNum } from "../../utils/format";
import StatCard from "../common/statCard";
import Spinner from "../common/Spinner";
import { AVATAR_URL } from "../../constants/images";
import {
  fetchSuperadminDashboard,
  type SuperadminDashboardData,
} from "@/lib/api/superadminDashboard";

export type { SuperadminDashboardData };

export default function Dashboard() {
  const [data, setData] = useState<SuperadminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuperadminDashboard()
      .then(({ ok, status, data: payload }) => {
        if (!ok) {
          throw new Error(payload.message || (status === 403 ? "Forbidden" : "Failed to load"));
        }
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error loading dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto px-3 sm:px-4">
        <div className="py-4 sm:p-6 flex items-center justify-center min-h-[40vh]">
          <Spinner />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 overflow-y-auto px-3 sm:px-4">
        <div className="py-4 sm:p-6 text-center text-red-400">{error}</div>
      </main>
    );
  }

  const stats = data?.stats ?? { totalSchools: 0, totalStudents: 0, totalTeachers: 0 };
  const schools = data?.schools ?? [];
  const feeTransactions = data?.feeTransactions ?? [];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="bg-transparent min-h-screen space-y-6">
        <PageHeader
          title="Superadmin Dashboard"
          subtitle="Manage everything from here"
        />

        <div className="flex flex-col lg:flex-row gap-[10px]">
          <div className="flex flex-col gap-[10px] w-full lg:w-1/2">
            <StatCard
              title="Total Schools"
              value={fmtNum(stats.totalSchools)}
              icon={<School size={22} className="sm:w-10 sm:h-10 text-lime-300" />}
              footer="Active institutions"
            />
            <StatCard
              title="Total Students"
              value={fmtNum(stats.totalStudents)}
              icon={<Users size={22} className="sm:w-10 sm:h-10 text-lime-300" />}
              footer="Across all schools"
            />
            <StatCard
              title="Total Teachers"
              value={fmtNum(stats.totalTeachers)}
              icon={<GraduationCap size={22} className="sm:w-10 sm:h-10 text-lime-300" />}
              footer="Across all schools"
            />
            <StatCard title="Schools" className="w-full">
              <div className="border border-white/10 rounded-xl overflow-hidden w-full">
                <div className="grid grid-cols-3 gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold text-white/80 text-center">
                  <span>Sl. No</span>
                  <span className="text-left">School</span>
                  <span>Students</span>
                </div>
                {schools.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-white/60 text-center">No schools yet</div>
                ) : (
                  schools.slice(0, 8).map((s, i) => (
                    <div key={s.id} className="grid grid-cols-3 gap-2 items-center px-3 sm:px-4 py-3 border-t border-white/10 text-xs sm:text-sm">
                      <span className="text-white text-center">{i + 1}</span>
                      <div className="flex items-center gap-2 min-w-0 text-left">
                        <img
                          src={s.photoUrl?.trim() ? s.photoUrl : AVATAR_URL}
                          alt={`${s.name} profile`}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-white/20 flex-shrink-0"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = AVATAR_URL;
                          }}
                        />
                        <span className="text-white font-medium truncate">{s.name}</span>
                      </div>
                      <span className="text-white/80 text-center">{fmtNum(s.studentCount)}</span>
                    </div>
                  ))
                )}
              </div>
            </StatCard>
          </div>

          <StatCard title="Fee Transactions" className="w-full max-w-md lg:max-w-none">
            <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
              <div className="grid grid-cols-4 gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold text-white/80 text-center">
                <span>Sl. No</span>
                <span className="text-left">School</span>
                <span>Amount</span>
                <span>Date</span>
              </div>
              {feeTransactions.length === 0 ? (
                <div className="px-4 py-6 text-sm text-white/60 text-center">No transactions yet</div>
              ) : (
                feeTransactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="grid grid-cols-4 gap-2 items-center px-3 sm:px-4 py-3 border-t border-white/10 text-xs sm:text-sm">
                    <span className="text-white text-center">{t.slNo}</span>
                    <span className="text-white truncate text-left">{t.schoolName}</span>
                    <span className="text-white text-center">₹{t.amount.toLocaleString()}</span>
                    <span className="text-white/70 text-center">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                ))
              )}
            </div>
          </StatCard>
        </div>
      </div>
    </main>
  );
}
