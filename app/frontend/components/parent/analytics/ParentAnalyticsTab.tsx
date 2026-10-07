"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  loadParentAnalytics,
  fetchParentHomeworkList,
  fetchParentEventsList,
  peekParentAnalytics,
  peekParentPortalAny,
  type ParentAnalyticsPayload,
} from "@/lib/loadParentPortal";
import {
  CheckCircle2,
  BookOpen,
  Trophy,
  Target,
} from "lucide-react";
import AnalyticsHeader from "./AnalyticsHeader";
import StatCard from "./StatCard";
import PerformanceOverview from "./PerformanceOverview";
import AttendanceAnalysis from "./AttendanceAnalysis";
import ProfileCard from "./ProfileCard";
import HomeworkTasks from "./HomeworkTasks";
import RecentUpdates from "./RecentUpdates";
import UpcomingWorkshops from "./UpcomingWorkshops";
import ParentTimellyLoader from "../ParentTimellyLoader";
import { AVATAR_URL } from "@/app/frontend/constants/images";

type AnalyticsData = ParentAnalyticsPayload;

interface HomeworkApiItem {
  id: string;
  subject: string;
  title: string;
  dueDate: string | null;
  hasSubmitted?: boolean;
}

interface EventApiItem {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  mode?: string | null;
  photo?: string | null;
  maxSeats?: number | null;
  teacher?: { name?: string | null } | null;
  _count?: { registrations?: number };
}

export default function ParentAnalyticsTab() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const [data, setData] = useState<AnalyticsData | null>(() => peekParentAnalytics(null));
  const [loading, setLoading] = useState(!peekParentAnalytics(null));
  const [error, setError] = useState<string | null>(null);
  const [homeworkApiData, setHomeworkApiData] = useState<HomeworkApiItem[]>([]);
  const [eventsApiData, setEventsApiData] = useState<EventApiItem[]>([]);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    const peeked = peekParentAnalytics(studentId);
    if (peeked) {
      setData(peeked);
      setLoading(false);
    }

    let active = true;

    (async () => {
      try {
        const analyticsData = await loadParentAnalytics(studentId, {
          onLoaded: (payload) => {
            if (active) {
              setData(payload);
              setLoading(false);
            }
          },
        });
        if (!active) return;
        setData(analyticsData);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;

    (async () => {
      try {
        const [homeworkJson, eventsJson] = await Promise.all([
          fetchParentHomeworkList(studentId),
          fetchParentEventsList(studentId),
        ]);
        if (!active) return;
        setHomeworkApiData(
          Array.isArray(homeworkJson?.homeworks) ? (homeworkJson.homeworks as HomeworkApiItem[]) : []
        );
        setEventsApiData(
          Array.isArray(eventsJson?.events) ? (eventsJson.events as EventApiItem[]) : []
        );
      } catch {
        if (!active) return;
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ParentTimellyLoader preset="analytics" className="w-full max-w-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Failed to load analytics"}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
    return `₹${amount}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "TBD";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getDueLabel = (dueDate: string | null) => {
    if (!dueDate) return "No due date";
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (Number.isNaN(diffDays)) return "No due date";
    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Due Today";
    if (diffDays === 1) return "Due Tomorrow";
    return `Due: ${diffDays} days`;
  };

  const homeworkTasks = homeworkApiData
    .filter((hw) => !hw.hasSubmitted)
    .slice(0, 3)
    .map((hw) => ({
      subject: hw.subject || "Homework",
      title: hw.title || "Untitled homework",
      dueLabel: getDueLabel(hw.dueDate),
    }));

  const pendingHomeworkCount = homeworkTasks.length;

  const recentUpdates = eventsApiData.slice(0, 3).map((event) => {
    const kind = event.mode?.trim() || "event";
    const dateLabel = event.eventDate
      ? new Date(event.eventDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "TBD";

    return {
      title: event.title || "School Update",
      kind,
      dateLabel,
    };
  });

  const workshops = eventsApiData
    .map((event) => {
      const date = event.eventDate ? new Date(event.eventDate) : null;
      const registrations = event._count?.registrations ?? 0;
      const seatsLeft =
        typeof event.maxSeats === "number" && event.maxSeats >= 0
          ? Math.max(event.maxSeats - registrations, 0)
          : null;

      return {
        id: event.id,
        title: event.title || "Workshop",
        teacher: event.teacher?.name || "School Faculty",
        dateLabel: date
          ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "Date TBD",
        timeLabel: date
          ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "Time TBD",
        seatsLabel: seatsLeft === null ? "Seats info unavailable" : `${seatsLeft} seats available`,
        mode: event.mode?.trim() || "Offline",
        image: event.photo?.trim() || AVATAR_URL,
      };
    })
    .slice(0, 2);

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <AnalyticsHeader />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main */}
        <div className="lg:col-span-3 space-y-6">
          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-4">
            <StatCard
              icon={<CheckCircle2 />}
              label="Attendance"
              value={`${data.stats.attendance.percent}%`}
              sub={`${data.stats.attendance.present}/${data.stats.attendance.total} days present`}
              tag={data.stats.attendance.change}
            />
            <StatCard
              icon={<BookOpen />}
              label="Homework"
              value={`${data.stats.homework.total} Tasks`}
              sub={`${data.stats.homework.completion}% completion`}
              tag={data.stats.homework.total > 0 ? "Due Soon" : "No Tasks"}
            />
            <StatCard
              icon={<Trophy />}
              label="Overall Grade"
              value={data.stats.grade.letter}
              sub={`Score: ${data.stats.grade.score}%`}
              tag={data.stats.grade.rank ? `Rank #${data.stats.grade.rank}` : "N/A"}
            />
            <StatCard
              icon={<Target />}
              label="Fee Pending"
              value={formatCurrency(data.stats.fee.pending)}
              sub={`Total: ${formatCurrency(data.stats.fee.total)}`}
              tag={data.stats.fee.dueDate ? `Due ${formatDate(data.stats.fee.dueDate)}` : "N/A"}
            />
          </div>

          {/* Performance Overview */}
          <PerformanceOverview data={data.performance.data} average={data.performance.average} />

          {/* Attendance Analysis */}
          <AttendanceAnalysis
            percent={data.attendanceAnalysis.percent}
            present={data.attendanceAnalysis.present}
            absent={data.attendanceAnalysis.absent}
            late={data.attendanceAnalysis.late}
            change={data.attendanceAnalysis.change}
          />

          {/* Homework and Recent Updates */}
          <div className="grid md:grid-cols-2 gap-6">
            <HomeworkTasks tasks={homeworkTasks} pendingCount={pendingHomeworkCount} />
            <RecentUpdates updates={recentUpdates} newCount={recentUpdates.length} />
          </div>

        </div>

        {/* Right Profile */}
        <div className="space-y-6">
          <ProfileCard
            name={data.student.name}
            rollNo={data.student.rollNo}
            class={data.student.class}
            photoUrl={data.student.photoUrl ?? null}
            grade={data.stats.grade.letter}
            score={data.stats.grade.score}
            rank={data.stats.grade.rank}
          />
          {/* <BestQualities /> */}
        </div>

        {/* Upcoming Workshops */}
        <div className="lg:col-span-4">
          <UpcomingWorkshops workshops={workshops} />
        </div>
      </div>
    </div>
  );
}
