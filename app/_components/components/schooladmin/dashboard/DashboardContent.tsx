"use client";

import { AttendanceCard } from "./components/AttendanceCard";
import { SidebarList } from "./components/SidebarList";
import { DayCollectionByHeadCard } from "./components/DayCollectionByHeadCard";
import { SchoolDashboardLoader } from "./components/SchoolDashboardLoader";
import { ROUTES } from "@/app/_components/constants/routes";
import { useSchoolDashboardState } from "./shared";
import { DashboardStatsHeader } from "./shared";
import { DashboardNewsSection } from "./shared";

export default function Dashboard() {
  const {
    data,
    error,
    router,
    userName,
    selectedCollectionFrom,
    selectedCollectionTo,
    collectionLoading,
    headsLoading,
    handleCollectionDateRangeChange,
    collectionCash,
    collectionOnline,
    isInitialLoading,
    retry,
  } = useSchoolDashboardState();

  return (
    <div className="min-h-screen space-y-4 md:space-y-8 max-w-[1900px] mx-auto">
      <DashboardStatsHeader
        userName={userName}
        data={data}
        isInitialLoading={isInitialLoading}
        selectedCollectionTo={selectedCollectionTo}
        onDateChange={(dateYmd) => handleCollectionDateRangeChange({ from: dateYmd, to: dateYmd })}
        collectionCash={collectionCash}
        collectionOnline={collectionOnline}
        collectionLoading={collectionLoading}
      />

      {isInitialLoading ? (
        <SchoolDashboardLoader />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            <div className="lg:col-span-2">
              <AttendanceCard
                present={data.attendance.present}
                absent={data.attendance.absent}
                late={data.attendance.late}
                total={data.attendance.total}
                overallRate={data.attendance.overallRate}
                presentPct={data.attendance.presentPct}
                absentPct={data.attendance.absentPct}
                latePct={data.attendance.latePct}
              />
            </div>

            <div className="space-y-4 sm:space-y-6 md:space-y-8">
              <SidebarList
                title="Teachers on Leave"
                subtitle="Current leave requests"
                items={data.teachersOnLeave.map((t) => ({
                  title: t.name,
                  subtitle: `${t.subject} • ${t.leaveType.replace("_", " ")}`,
                  meta: `${t.days} day${t.days > 1 ? "s" : ""}`,
                  status: t.status === "APPROVED" ? "Approved" : "Pending",
                  type: "teacher" as const,
                }))}
                onViewAllClick={() => router.push(ROUTES.SCHOOLADMIN_TEACHER_LEAVE_TAB)}
              />
              <SidebarList
                title="Recent Activities"
                subtitle="Latest updates and actions"
                items={data.recentActivities.map((a) => ({
                  title: a.title,
                  subtitle: a.subtitle,
                  meta: a.meta,
                  type: "activity" as const,
                  activityType: (a.type?.includes("Leave")
                    ? "leave"
                    : a.type?.includes("Fee")
                      ? "fee"
                      : a.type?.includes("News")
                        ? "news"
                        : "certificate") as "leave" | "fee" | "news" | "certificate",
                }))}
              />
            </div>
          </div>

          <DayCollectionByHeadCard
            fromDate={selectedCollectionFrom}
            toDate={selectedCollectionTo}
            onDateRangeChange={handleCollectionDateRangeChange}
            rows={data.todayCollectionByHead?.rows ?? []}
            formattedTotal={data.todayCollectionByHead?.formattedTotal ?? "0"}
            loading={headsLoading}
          />
        </>
      ) : null}

      <DashboardNewsSection
        latestNews={data?.latestNews}
        onViewAll={() => router.push(ROUTES.SCHOOLADMIN_NEWSFEED_TAB)}
      />

      {error && (
        <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-2xl p-8 text-center">
          <p className="text-red-400 font-semibold mb-2">Error loading dashboard</p>
          <p className="text-red-300/80 text-sm">{error}</p>
          <button
            onClick={retry}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
