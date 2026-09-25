"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Sun } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentHomeStats from "./ParentHomeStats";
import ParentHomeCircularsSection from "./ParentHomeCircularsSection";
import ParentHomeUpdatesSection from "./ParentHomeUpdatesSection";
import { ParentHomeData } from "./types";
import ParentTimellyLoader from "../ParentTimellyLoader";
import {
  loadParentDashboard,
  peekParentDashboard,
  type ParentDashboardPayload,
} from "@/lib/loadParentPortal";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function mapAverageToGrade(avg: number) {
  if (avg >= 90) return "A+";
  if (avg >= 80) return "A";
  if (avg >= 70) return "B+";
  if (avg >= 60) return "B";
  return "C";
}

function toHomeData(payload: ParentDashboardPayload): ParentHomeData {
  return {
    studentName: payload.studentName ?? "Student",
    attendancePct: Number(payload.attendancePct ?? 0),
    presentDays: Number(payload.presentDays ?? 0),
    totalAttendanceDays: Number(payload.totalAttendanceDays ?? 0),
    homeworkSubmitted: Number(payload.homeworkSubmitted ?? 0),
    homeworkTotal: Number(payload.homeworkTotal ?? 0),
    averageMarksPct: Number(payload.averageMarksPct ?? 0),
    gradeLabel:
      payload.gradeLabel ?? mapAverageToGrade(Number(payload.averageMarksPct ?? 0)),
    feePendingAmount: Number(payload.feePendingAmount ?? 0),
    circulars: Array.isArray(payload.circulars) ? (payload.circulars as ParentHomeData["circulars"]) : [],
    events: Array.isArray(payload.events) ? payload.events : [],
    feeds: Array.isArray(payload.feeds) ? (payload.feeds as ParentHomeData["feeds"]) : [],
  };
}

function initialState(): ParentHomeData {
  return {
    studentName: "Student",
    attendancePct: 0,
    presentDays: 0,
    totalAttendanceDays: 0,
    homeworkSubmitted: 0,
    homeworkTotal: 0,
    averageMarksPct: 0,
    gradeLabel: "C",
    feePendingAmount: 0,
    circulars: [],
    events: [],
    feeds: [],
  };
}

export default function ParentHomeTab() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const [data, setData] = useState<ParentHomeData>(() => {
    const peeked = peekParentDashboard(null);
    return peeked ? toHomeData(peeked) : initialState();
  });
  const [loading, setLoading] = useState(() => !peekParentDashboard(null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const peeked = peekParentDashboard(studentId);
        if (peeked) {
          setData(toHomeData(peeked));
          setLoading(false);
        }

        await loadParentDashboard(studentId, {
          onFastLoaded: (payload) => {
            if (!active) return;
            setData(toHomeData(payload));
            setLoading(false);
          },
          onFullLoaded: (payload) => {
            if (!active) return;
            setData(toHomeData(payload));
          },
        });
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load parent home dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  if (loading) {
    return <ParentTimellyLoader preset="dashboard" className="w-full" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-8 text-red-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-4 sm:pb-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5 sm:gap-2">
            Home
            <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-300 flex-shrink-0" />
          </span>
        }
        subtitle={`${getGreeting()}! Welcome back, here's what's happening with ${data.studentName}`}
        compact
      />

      <ParentHomeStats
        attendancePct={data.attendancePct}
        presentDays={data.presentDays}
        totalAttendanceDays={data.totalAttendanceDays}
        homeworkSubmitted={data.homeworkSubmitted}
        homeworkTotal={data.homeworkTotal}
        averageMarksPct={data.averageMarksPct}
        gradeLabel={data.gradeLabel}
        feePendingAmount={data.feePendingAmount}
      />

      <ParentHomeCircularsSection circulars={data.circulars} />
      <ParentHomeUpdatesSection feeds={data.feeds} events={data.events} />
    </div>
  );
}
