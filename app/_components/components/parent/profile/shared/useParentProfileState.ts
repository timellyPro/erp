import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import { Award, TrendingUp, BookOpen, Clock, Calendar } from "lucide-react";
import type { ProfileReportData } from "../../../pdf/ProfileReportTemplate";
import { downloadParentPortalPdf } from "@/lib/parent/downloadParentPortalPdf";
import { currentAcademicYearLabel, resolveSchoolBrand } from "@/lib/school/resolveSchoolBrand";
import {
  fetchParentHomeworkList,
  fetchParentEventsList,
  fetchParentMarks,
  fetchParentProfileShell,
  peekParentDashboard,
  peekParentProfileShell,
} from "@/lib/parent/loadParentPortal";
import type { Mark, StudentProfile } from "./parentProfileTypes";

export function useParentProfileState() {
  const { data: session, status } = useSession();
  const studentId = (session?.user as { studentId?: string | null })?.studentId ?? null;
  const initialProfile = peekParentProfileShell(studentId) as StudentProfile | null;
  const initialDash = peekParentDashboard(studentId);

  const [profile, setProfile] = useState<StudentProfile | null>(initialProfile);
  const [user, setUser] = useState<{ name: string | null; photoUrl: string | null; mobile: string | null } | null>(null);
  const [homeworkTotal, setHomeworkTotal] = useState(initialDash?.homeworkTotal ?? 0);
  const [_homeworkSubmitted, setHomeworkSubmitted] = useState(initialDash?.homeworkSubmitted ?? 0);
  const [pendingHomework, setPendingHomework] = useState(
    Math.max(0, (initialDash?.homeworkTotal ?? 0) - (initialDash?.homeworkSubmitted ?? 0))
  );
  const [upcomingEvents, setUpcomingEvents] = useState(0);
  const [loading, setLoading] = useState(!initialProfile);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfReportData, setPdfReportData] = useState<ProfileReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [examTypeFilter, setExamTypeFilter] = useState<string>("ALL");
  // compute academic year string based on current date
  const [academicYear, setAcademicYear] = useState("");

  const [marks, setMarks] = useState<Mark[]>([]);

  const fetchData = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setError("No student linked to this account.");
      return;
    }
    if (!profile) setLoading(true);
    setError(null);
    try {
      const [userRes, profileData] = await Promise.all([
        fetch("/api/user/me", { credentials: "include" }),
        fetchParentProfileShell(studentId),
      ]);
      if (userRes.ok) {
        const d = await userRes.json();
        setUser(d.user ?? null);
      }
      if (profileData) {
        setProfile(profileData as StudentProfile);
      } else {
        setError("Failed to load profile");
      }

      const dash = peekParentDashboard(studentId);
      if (dash) {
        setHomeworkTotal(dash.homeworkTotal);
        setHomeworkSubmitted(dash.homeworkSubmitted);
        setPendingHomework(Math.max(0, dash.homeworkTotal - dash.homeworkSubmitted));
      }

      void Promise.all([
        fetchParentHomeworkList(studentId),
        fetchParentEventsList(studentId),
        fetchParentMarks(studentId),
      ])
        .then(([homeworkData, eventsData, marksData]) => {
          const hwList = homeworkData.homeworks ?? [];
          setHomeworkTotal(hwList.length);
          const submitted = hwList.filter((h) => (h as { hasSubmitted?: boolean }).hasSubmitted).length;
          setHomeworkSubmitted(submitted);
          setPendingHomework(hwList.length - submitted);

          const evList = eventsData.events ?? [];
          const now = new Date();
          const upcoming = evList.filter(
            (e) =>
              (e as { eventDate?: string }).eventDate &&
              new Date((e as { eventDate: string }).eventDate) >= now
          ).length;
          setUpcomingEvents(upcoming);
          setMarks((marksData.marks ?? []) as Mark[]);
        })
        .catch(() => undefined);
      // Academic year calc
      const yr = new Date().getFullYear();
      setAcademicYear(`${yr - 1}-${yr}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads only when the student changes; profile is merged via functional setState
  }, [studentId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setLoading(false);
      setError("Please sign in.");
      return;
    }
    fetchData();
  }, [session?.user, status, fetchData]);

  useEffect(() => {
    void resolveSchoolBrand();
  }, []);

  const filteredMarks = useMemo(() => {
    if (examTypeFilter === "ALL") return marks;
    return marks.filter((m) => (m.examType || "").trim() === examTypeFilter);
  }, [marks, examTypeFilter]);

  const filteredPerformance = useMemo(() => {
    if (!profile) return [];
    if (filteredMarks.length > 0) {
      const bySubject = new Map<string, { total: number; max: number }>();
      filteredMarks.forEach((m) => {
        const existing = bySubject.get(m.subject) || { total: 0, max: 0 };
        existing.total += m.marks;
        existing.max += m.totalMarks;
        bySubject.set(m.subject, existing);
      });
      return Array.from(bySubject.entries()).map(([subject, agg]) => ({
        subject,
        score: agg.max > 0 ? Math.round((agg.total / agg.max) * 100) : 0,
      }));
    }
    return profile.academicPerformance;
  }, [profile, filteredMarks]);

  const attendancePct = useMemo(() => {
    if (!profile || profile.attendanceTrends.length === 0) return 0;
    return Math.round(
      profile.attendanceTrends.reduce((a, t) => a + t.pct, 0) / profile.attendanceTrends.length
    );
  }, [profile]);

  const overallGrade = useMemo(() => {
    if (filteredPerformance.length === 0) return "—";
    const avg = Math.round(
      filteredPerformance.reduce((a, x) => a + x.score, 0) / filteredPerformance.length
    );
    if (avg >= 90) return "A+";
    if (avg >= 80) return "A";
    if (avg >= 70) return "B+";
    if (avg >= 60) return "B";
    return "C";
  }, [filteredPerformance]);

  const stats = useMemo(
    () => [
      { label: "Overall grade", value: overallGrade, icon: Award },
      { label: "Attendance", value: `${attendancePct}%`, icon: TrendingUp },
      { label: "Total assignments", value: String(homeworkTotal), icon: BookOpen },
      { label: "Pending homework", value: String(pendingHomework), icon: Clock },
      { label: "Upcoming events", value: String(upcomingEvents), icon: Calendar },
    ],
    [overallGrade, attendancePct, homeworkTotal, pendingHomework, upcomingEvents]
  );

  const profileReportPreview = useMemo((): ProfileReportData | null => {
    if (!profile) return null;
    const s = profile.student;
    return {
      studentName: s.name || "Student",
      admissionNumber: s.admissionNumber,
      className: s.class?.displayName,
      rollNo: s.rollNo,
      dob: s.dob,
      fatherName: s.fatherName,
      motherName: s.motherName,
      phone: s.phone || user?.mobile || undefined,
      email: s.email,
      academicYear: academicYear || currentAcademicYearLabel(),
      dateGenerated: new Date(),
      stats: stats.map((item) => ({ label: item.label, value: String(item.value) })),
      attendanceTrends: profile.attendanceTrends,
      academicPerformance: filteredPerformance,
      certificates: profile.certificates,
    };
  }, [profile, user, academicYear, stats, filteredPerformance]);

  const generatePdf = useCallback(async () => {
    if (!profileReportPreview) return;
    setPdfLoading(true);
    try {
      await downloadParentPortalPdf({
        ref: reportRef,
        filename: `Student_Profile_${profileReportPreview.admissionNumber || "report"}.pdf`,
        minHeight: 400,
        beforeCapture: (brand) => {
          flushSync(() => {
            setPdfReportData({
              ...profileReportPreview,
              schoolName: brand.name,
              schoolLogo: brand.logo,
              schoolAddress: brand.address,
            });
          });
        },
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  }, [profileReportPreview]);

  return {
    session,
    status,
    profile,
    user,
    loading,
    error,
    pdfLoading,
    pdfReportData,
    reportRef,
    examTypeFilter,
    setExamTypeFilter,
    academicYear,
    marks,
    filteredPerformance,
    stats,
    profileReportPreview,
    generatePdf,
  };
}
